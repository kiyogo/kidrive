"use client";

import { useEffect, useState, useMemo, useCallback, use } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BootScreen,
  ConnectScreen,
  LanguageScreen,
  SetupScreen,
  SignInScreen,
  WelcomeScreen,
} from "@/components/auth/AuthScreens";
import { TwoFactorSetup } from "@/components/auth/TwoFactorSetup";
import { FilesBrowser } from "@/components/files/FilesBrowser";
import { ActivityScreen, SettingsScreen, StorageScreen } from "@/components/settings/Settings";
import { GalleryScreen, TransfersScreen } from "@/components/gallery/Gallery";
import { VideosScreen } from "@/components/gallery/VideosScreen";
import { Preview } from "@/components/preview/Preview";
import { SearchScreen } from "@/components/search/SearchScreen";
import { Shell, type Section } from "@/components/Shell";
import { FloatingTransfersTray } from "@/components/TransfersTray";
import { Button, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { useL10n } from "@/lib/l10n";
import { useSession } from "@/lib/session";
import type { NodeModel } from "@/lib/models";
import { useUploader } from "@/lib/uploads";
import { applyDashboardSettings, getStoredDashboardSettings } from "@/lib/systemSettings";

/**
 * Universal catch-all app router. Handles root `/`, `/invite/[code]`, `/storage`,
 * `/settings/[section]`, `/files/[id]`, and every other application route with
 * full deep-linking, back/forward history support, and 100% Flutter parity.
 */
export default function AppClient({
  params,
}: {
  params?: Promise<{ slug?: string[] }> | { slug?: string[] };
} = {}) {
  const unwrappedParams = params ? ("then" in params ? use(params) : params) : undefined;
  const slug = unwrappedParams?.slug;
  const pathname = usePathname() || "";
  const router = useRouter();
  const { stage, locale, refreshUser } = useSession();

  useEffect(() => {
    applyDashboardSettings(getStoredDashboardSettings());
  }, []);

  const [step, setStep] = useState<"welcome" | "language" | "connect">(() =>
    typeof window !== "undefined" && localStorage.getItem("ld.locale.chosen") === "1"
      ? "connect"
      : "welcome",
  );

  const isInvite = pathname.startsWith("/invite/") || (slug && slug[0] === "invite");
  const inviteCodeFromPath = isInvite
    ? (slug && slug[1]) || pathname.replace(/^\/invite\/?/, "").split("/")[0] || ""
    : "";

  const isCreateAccount =
    pathname.startsWith("/create-account") ||
    (slug && slug[0] === "create-account") ||
    Boolean(inviteCodeFromPath);

  const isTwoFactor =
    pathname === "/two-factor" || (slug && slug[0] === "two-factor");

  const [createMode, setCreateMode] = useState<boolean>(Boolean(isCreateAccount));
  const [inviteCode, setInviteCode] = useState<string>(inviteCodeFromPath);

  useEffect(() => {
    if (inviteCodeFromPath) {
      setInviteCode(inviteCodeFromPath);
      setCreateMode(true);
    } else if (pathname === "/signin") {
      setCreateMode(false);
    } else if (pathname === "/create-account") {
      setCreateMode(true);
    }
  }, [pathname, inviteCodeFromPath]);

  useEffect(() => {
    if (stage === "ready") {
      if (pathname === "/signin" || pathname === "/create-account" || isInvite) {
        router.replace("/files");
      }
    } else if (stage === "mustEnableTotp") {
      if (pathname !== "/two-factor") {
        router.replace("/two-factor");
      }
    } else if (stage === "signedOut") {
      if (pathname === "/two-factor") {
        router.replace("/signin");
      }
    }
  }, [stage, pathname, isInvite, router]);

  if (stage === "loading") return <BootScreen />;

  if (stage === "needsServer") {
    if (step === "welcome") return <WelcomeScreen onContinue={() => setStep("language")} />;
    if (step === "language") {
      return (
        <LanguageScreen
          onBack={() => setStep("welcome")}
          onDone={() => {
            localStorage.setItem("ld.locale.chosen", "1");
            setStep("connect");
          }}
        />
      );
    }
    return <ConnectScreen onBack={() => setStep("language")} />;
  }

  if (stage === "needsSetup") return <SetupScreen />;

  if (
    stage === "signedOut" ||
    ((isInvite || pathname === "/signin" || pathname === "/create-account") && stage !== "ready")
  ) {
    return (
      <SignInScreen
        createMode={createMode}
        inviteCode={inviteCode}
        onToggleMode={(creating) => {
          setCreateMode(creating);
          if (creating) {
            router.push(inviteCode ? `/create-account/${inviteCode}` : "/create-account");
          } else {
            router.push("/signin");
          }
        }}
      />
    );
  }

  if (stage === "mustChangePassword") return <MustChangePassword />;
  if (stage === "mustEnableTotp") {
    return (
      <TwoFactorSetup
        required={true}
        onDone={() => {
          void refreshUser();
          router.replace("/files");
        }}
      />
    );
  }

  if (isTwoFactor) {
    return (
      <TwoFactorSetup
        required={false}
        onDone={() => {
          void refreshUser();
          router.push("/files");
        }}
        onBack={() => {
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
          } else {
            router.push("/settings/two-factor");
          }
        }}
      />
    );
  }

  return <Drive key={`${locale}-${slug?.join("/") || "files"}`} initialSlug={slug} />;
}

/* ------------------------------------------------------------------ drive */

function parsePathToSection(
  path: string,
  slug?: string[],
): { section: Section; subSection?: string; folderId?: string } {
  const clean = path.replace(/^\//, "");
  const parts = slug && slug.length > 0 ? slug : clean.split("/").filter(Boolean);
  const first = parts[0]?.toLowerCase() || "";

  if (first === "storage") return { section: "storage" };
  if (first === "image" || first === "gallery") return { section: "image" };
  if (first === "videos") return { section: "videos" };
  if (first === "shared") return { section: "shared", folderId: parts[1] };
  if (first === "recent") return { section: "recent" };
  if (first === "starred") return { section: "starred" };
  if (first === "trash") return { section: "trash" };
  if (first === "activity") return { section: "activity" };
  if (first === "transfers") return { section: "transfers" };
  if (first === "search") return { section: "search" };
  if (first === "settings") return { section: "settings", subSection: parts[1] };
  if (first === "files") {
    let rawRest = parts.slice(1).join("/");
    if (rawRest.startsWith("dataset:")) {
      rawRest = rawRest.replace(/^dataset:/, "");
    }
    return { section: "files", folderId: rawRest || undefined };
  }

  return { section: "files" };
}

function Drive({ initialSlug }: { initialSlug?: string[] }) {
  const t = useL10n();
  const { user } = useSession();

  // If user has a single assigned dataset/category (not full root "/" or "*"):
  const defaultSingleDataset = useMemo<string | null>(() => {
    if (!user || !user.dataset_permissions) return null;
    try {
      const perms = JSON.parse(user.dataset_permissions);
      if (perms["/"] || perms["*"]) {
        const rootPerm = perms["/"] || perms["*"];
        const canReadRoot = typeof rootPerm === "object" ? rootPerm.read : rootPerm !== "none";
        if (canReadRoot && user.role === "admin") {
          return null; // Admin with full root access
        }
      }
      const keys = Object.keys(perms)
        .map((k) => k.trim().replace(/^\/+|\/+$/g, ""))
        .filter((k) => k && k !== "*" && k !== "/");
      const unique = Array.from(new Set(keys));
      const roots = unique.filter((item) => {
        const itemLower = item.toLowerCase();
        return !unique.some((other) => {
          const otherLower = other.toLowerCase();
          return otherLower !== itemLower && itemLower.startsWith(otherLower + "/");
        });
      });
      return roots.length === 1 ? roots[0] : null;
    } catch {
      return null;
    }
  }, [user]);

  const getCleanUrl = useCallback(
    (folderId?: string) => {
      if (!folderId) return "/files";
      let clean = folderId.replace(/^dataset:/, "").replace(/\\/g, "/").replace(/:/g, "/");
      clean = clean.replace(/^\/+|\/+$/g, "");
      if (defaultSingleDataset) {
        const dsClean = defaultSingleDataset.replace(/^\/+|\/+$/g, "");
        if (clean.toLowerCase() === dsClean.toLowerCase()) {
          return "/files";
        }
        if (clean.toLowerCase().startsWith(dsClean.toLowerCase() + "/")) {
          clean = clean.slice(dsClean.length + 1);
        }
      }
      return clean ? `/files/${clean}` : "/files";
    },
    [defaultSingleDataset],
  );

  const resolveFolderFromUrl = useCallback(
    (urlFolderId?: string) => {
      if (!urlFolderId) return [];
      let clean = urlFolderId.replace(/^dataset:/, "").replace(/\\/g, "/").replace(/:/g, "/");
      clean = clean.replace(/^\/+|\/+$/g, "");
      if (!clean) return [];

      if (defaultSingleDataset) {
        const dsClean = defaultSingleDataset.replace(/^\/+|\/+$/g, "");
        if (clean.toLowerCase() === dsClean.toLowerCase()) {
          return [{ id: `dataset:${dsClean}`, name: dsClean.split("/").pop() || dsClean }];
        }
        let sub = clean;
        if (clean.toLowerCase().startsWith(dsClean.toLowerCase() + "/")) {
          sub = clean.slice(dsClean.length + 1);
        }
        const segments = sub.split("/").filter(Boolean);
        const trail: { id: string; name: string }[] = [];
        let acc = dsClean;
        for (const seg of segments) {
          acc = `${acc}/${seg}`;
          trail.push({ id: `dataset:${acc}`, name: seg });
        }
        return trail;
      } else {
        const segments = clean.split("/").filter(Boolean);
        const trail: { id: string; name: string }[] = [];
        let acc = "";
        for (const seg of segments) {
          acc = acc ? `${acc}/${seg}` : seg;
          trail.push({ id: `dataset:${acc}`, name: seg });
        }
        return trail;
      }
    },
    [defaultSingleDataset],
  );

  const initial =
    typeof window !== "undefined"
      ? parsePathToSection(window.location.pathname, initialSlug)
      : { section: "files" as Section };

  const [section, setSection] = useState<Section>(initial.section);
  const [settingsSub, setSettingsSub] = useState<string | undefined>(initial.subSection);
  const [folder, setFolder] = useState<{ id: string; name: string }[]>(() => {
    return resolveFolderFromUrl(initial.folderId);
  });
  const [preview, setPreview] = useState<{ node: NodeModel; nodes?: NodeModel[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [newFolderTrigger, setNewFolderTrigger] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathToSection(window.location.pathname);
      setSection(parsed.section);
      if (parsed.subSection) setSettingsSub(parsed.subSection);
      if (parsed.section === "files") {
        setFolder(resolveFolderFromUrl(parsed.folderId));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [resolveFolderFromUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (window.location.pathname === "/") {
        window.history.replaceState(null, "", "/files");
      } else if (window.location.pathname === "/gallery") {
        window.history.replaceState(null, "", "/image");
      } else {
        const parsed = parsePathToSection(window.location.pathname);
        if (parsed.section === "files") {
          const trail = resolveFolderFromUrl(parsed.folderId);
          setFolder(trail);
          const cleanUrl = getCleanUrl(trail.length > 0 ? trail[trail.length - 1].id : undefined);
          if (window.location.pathname !== cleanUrl) {
            window.history.replaceState(null, "", cleanUrl);
          }
        }
      }
    }
  }, [defaultSingleDataset, resolveFolderFromUrl, getCleanUrl]);

  const navigateTo = (s: Section) => {
    setSection(s);
    if (s === "files") {
      setFolder([]);
      window.history.pushState(null, "", "/files");
    } else if (s === "settings") {
      const targetSub = settingsSub || "account";
      window.history.pushState(null, "", `/settings/${targetSub}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } else {
      window.history.pushState(null, "", `/${s}`);
    }
  };

  const handleSelectSettingsSub = (sub: string) => {
    setSettingsSub(sub);
    window.history.pushState(null, "", `/settings/${sub}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const openPreview = (node: NodeModel, nodes?: NodeModel[]) => {
    setPreview({ node, nodes });
  };

  const current = folder.length ? folder[folder.length - 1] : { id: "", name: t.myFiles };

  const uploadFolderId =
    section === "files"
      ? (current.id || (defaultSingleDataset ? `dataset:${defaultSingleDataset}` : ""))
      : "";

  const { pick: pickFiles, pickFolder, sheet: clashSheet } = useUploader(
    uploadFolderId,
    () => setRefresh((n) => n + 1),
  );

  const titles: Record<Section, string> = {
    files: current.name,
    image: t.gallery,
    videos: t.videos,
    shared: t.sharedWithMe,
    recent: t.recent,
    starred: t.starred,
    trash: t.trash,
    storage: t.storage,
    settings: t.settings,
    search: t.search,
    transfers: t.transfersTitle,
    activity: t.activity,
  };

  const filterFor: Record<string, "none" | "starred" | "recent" | "trash" | "shared"> = {
    files: "none",
    starred: "starred",
    recent: "recent",
    trash: "trash",
    shared: "shared",
  };

  return (
    <Shell
      section={section}
      onNavigate={navigateTo}
      onUpload={(files) => void pickFiles(files)}
      onUploadFolder={(files) => void pickFolder(files)}
      onCreateFolder={() => {
        if (section !== "files") {
          setSection("files");
          window.history.pushState(null, "", "/files");
        }
        setNewFolderTrigger((n) => n + 1);
      }}
    >
      {section === "settings" ? (
        <SettingsScreen
          initialSection={settingsSub}
          onSelectSection={handleSelectSettingsSub}
        />
      ) : section === "storage" ? (
        <StorageScreen />
      ) : section === "activity" ? (
        <ActivityScreen />
      ) : section === "image" ? (
        <GalleryScreen onOpen={openPreview} />
      ) : section === "videos" ? (
        <VideosScreen onOpen={openPreview} />
      ) : section === "transfers" ? (
        <TransfersScreen />
      ) : section === "search" ? (
        <SearchScreen
          onBack={() => navigateTo("files")}
          onOpenFolder={(node) => {
            const trail = resolveFolderFromUrl(node.id);
            setFolder(trail.length > 0 ? trail : [{ id: node.id, name: node.name }]);
            setSection("files");
            window.history.pushState(null, "", getCleanUrl(node.id));
          }}
          onPreview={(n, list) => openPreview(n, list)}
        />
      ) : section in filterFor ? (
        <FilesBrowser
          key={`${section}:${current.id}:${refresh}`}
          folderId={section === "files" ? current.id : ""}
          filter={filterFor[section]}
          title={titles[section]}
          trail={section === "files" ? folder : undefined}
          onNavigateTrail={(i) => {
            const next = folder.slice(0, i + 1);
            setFolder(next);
            const target = next[next.length - 1];
            window.history.pushState(null, "", getCleanUrl(target?.id));
          }}
          onRoot={() => {
            setFolder([]);
            window.history.pushState(null, "", "/files");
          }}
          createFolderTrigger={newFolderTrigger}
          onOpenFolder={(node) => {
            setFolder((t) => [...t, { id: node.id, name: node.name }]);
            window.history.pushState(null, "", getCleanUrl(node.id));
          }}
          onPreview={(n, list) => openPreview(n, list)}
          onSearch={() => {
            setSection("search");
            window.history.pushState(null, "", "/search");
          }}
        />
      ) : null}

      {clashSheet}
      {preview && (
        <Preview
          node={preview.node}
          nodes={preview.nodes}
          onClose={() => setPreview(null)}
          onNavigate={(next) => setPreview({ node: next, nodes: preview.nodes })}
        />
      )}
      {section !== "transfers" && (
        <FloatingTransfersTray onOpenTransfers={() => navigateTo("transfers")} />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ gates */

function MustChangePassword() {
  const t = useL10n();
  const { refreshUser, signOut } = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (next !== confirm) {
      setError(t.passwordsDoNotMatch);
      return;
    }
    if (next.length < 6) {
      setError(t.passwordTooShort);
      return;
    }
    setBusy(true);
    try {
      await api.patch(Api.mePassword, { current_password: current, new_password: next });
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errorUnexpectedTitle);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <h1 className="t-title-lg" style={{ margin: 0 }}>
          {t.mustChangePasswordTitle}
        </h1>
        <p className="t-body-md" style={{ color: "var(--fg-secondary)", margin: 0 }}>
          {t.mustChangePasswordBody}
        </p>
        <TextField
          value={current}
          onChange={setCurrent}
          label={t.currentPassword}
          hint={t.passwordHintExisting}
          type="password"
          glyph="lock"
          dir="ltr"
        />
        <TextField
          value={next}
          onChange={setNext}
          label={t.newPassword}
          hint={t.passwordHintNew}
          type="password"
          glyph="lock"
          dir="ltr"
        />
        <TextField
          value={confirm}
          onChange={setConfirm}
          label={t.confirmPasswordLabel}
          hint={t.confirmPasswordHint}
          type="password"
          glyph="lock"
          onEnter={go}
          dir="ltr"
        />
        {error && (
          <div className="t-body-sm" style={{ color: "var(--warning)" }}>
            {error}
          </div>
        )}
        <Button label={t.actionSave} onClick={() => void go()} busy={busy} />
        <Button label={t.settingsSignOut} variant="quiet" onClick={() => void signOut()} />
      </div>
    </div>
  );
}

function MustEnableTotp() {
  const { refreshUser } = useSession();
  return <TwoFactorSetup required onDone={() => void refreshUser()} />;
}
