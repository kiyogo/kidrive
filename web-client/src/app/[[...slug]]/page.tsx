"use client";

import { useEffect, useState, use } from "react";
import { usePathname } from "next/navigation";
import {
  BootScreen,
  ConnectScreen,
  LanguageScreen,
  PendingApprovalScreen,
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
import { Button, TextField } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { useL10n } from "@/lib/l10n";
import { useSession } from "@/lib/session";
import type { NodeModel } from "@/lib/models";
import { useUploader } from "@/lib/uploads";

/**
 * Universal catch-all app router. Handles root `/`, `/invite/[code]`, `/storage`,
 * `/settings/[section]`, `/files/[id]`, and every other application route with
 * full deep-linking, back/forward history support, and 100% Flutter parity.
 */
export default function AppRoute({
  params,
}: {
  params?: Promise<{ slug?: string[] }> | { slug?: string[] };
}) {
  const unwrappedParams = params ? ("then" in params ? use(params) : params) : undefined;
  const slug = unwrappedParams?.slug;
  const pathname = usePathname() || "";
  const { stage, locale } = useSession();

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

  if (stage === "signedOut" || isInvite || pathname === "/signin" || pathname === "/create-account") {
    return (
      <SignInScreen
        createMode={createMode}
        inviteCode={inviteCode}
        onToggleMode={(creating) => {
          setCreateMode(creating);
          if (creating) {
            window.history.pushState(
              null,
              "",
              inviteCode ? `/create-account/${inviteCode}` : "/create-account",
            );
          } else {
            window.history.pushState(null, "", "/signin");
          }
        }}
      />
    );
  }

  if (stage === "pendingApproval") return <PendingApprovalScreen />;
  if (stage === "mustChangePassword") return <MustChangePassword />;
  if (stage === "mustEnableTotp") return <MustEnableTotp />;

  return <Drive key={locale} initialSlug={slug} />;
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
  if (first === "gallery" || first === "image") return { section: "gallery" };
  if (first === "videos") return { section: "videos" };
  if (first === "shared") return { section: "shared", folderId: parts[1] };
  if (first === "recent") return { section: "recent" };
  if (first === "starred") return { section: "starred" };
  if (first === "trash") return { section: "trash" };
  if (first === "activity") return { section: "activity" };
  if (first === "transfers") return { section: "transfers" };
  if (first === "search") return { section: "search" };
  if (first === "settings") return { section: "settings", subSection: parts[1] };
  if (first === "files") return { section: "files", folderId: parts[1] };

  return { section: "files" };
}

function Drive({ initialSlug }: { initialSlug?: string[] }) {
  const t = useL10n();
  const initial =
    typeof window !== "undefined"
      ? parsePathToSection(window.location.pathname, initialSlug)
      : { section: "files" as Section };

  const [section, setSection] = useState<Section>(initial.section);
  const [settingsSub, setSettingsSub] = useState<string | undefined>(initial.subSection);
  const [folder, setFolder] = useState<{ id: string; name: string }[]>(
    initial.folderId ? [{ id: initial.folderId, name: initial.folderId }] : [],
  );
  const [preview, setPreview] = useState<{ node: NodeModel; nodes?: NodeModel[] } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [newFolderTrigger, setNewFolderTrigger] = useState(0);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parsePathToSection(window.location.pathname);
      setSection(parsed.section);
      if (parsed.subSection) setSettingsSub(parsed.subSection);
      if (parsed.section === "files" && !parsed.folderId) {
        setFolder([]);
      } else if (parsed.folderId) {
        setFolder([{ id: parsed.folderId, name: parsed.folderId }]);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      window.history.replaceState(null, "", "/files");
    }
  }, []);

  const navigateTo = (s: Section) => {
    setSection(s);
    if (s === "files") {
      setFolder([]);
      window.history.pushState(null, "", "/files");
    } else if (s === "settings") {
      const targetSub = settingsSub || "account";
      window.history.pushState(null, "", `/settings/${targetSub}`);
    } else {
      window.history.pushState(null, "", `/${s}`);
    }
  };

  const handleSelectSettingsSub = (sub: string) => {
    setSettingsSub(sub);
    window.history.pushState(null, "", `/settings/${sub}`);
  };

  const openPreview = (node: NodeModel, nodes?: NodeModel[]) => {
    setPreview({ node, nodes });
  };

  const current = folder.length ? folder[folder.length - 1] : { id: "", name: t.myFiles };

  const { pick: pickFiles, sheet: clashSheet } = useUploader(
    section === "files" ? current.id : "",
    () => setRefresh((n) => n + 1),
  );

  const titles: Record<Section, string> = {
    files: current.name,
    gallery: t.gallery,
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
      ) : section === "gallery" ? (
        <GalleryScreen onOpen={openPreview} />
      ) : section === "videos" ? (
        <VideosScreen onOpen={openPreview} />
      ) : section === "transfers" ? (
        <TransfersScreen />
      ) : section === "search" ? (
        <SearchScreen
          onBack={() => navigateTo("files")}
          onOpenFolder={(node) => {
            setFolder([{ id: node.id, name: node.name }]);
            setSection("files");
            window.history.pushState(null, "", `/files/${node.id}`);
          }}
          onPreview={(n) => openPreview(n)}
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
            window.history.pushState(null, "", target ? `/files/${target.id}` : "/files");
          }}
          onRoot={() => {
            setFolder([]);
            window.history.pushState(null, "", "/files");
          }}
          createFolderTrigger={newFolderTrigger}
          onOpenFolder={(node) => {
            setFolder((t) => [...t, { id: node.id, name: node.name }]);
            window.history.pushState(null, "", `/files/${node.id}`);
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
    if (next.length < 10) {
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
