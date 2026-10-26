"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { Button, Dialog, DropdownStatus, Spinner, Tappable, TextField, useDeviceClass, useToast } from "@/components/ui";
import { api } from "@/lib/api";
import { Api } from "@/lib/endpoints";
import { bytes } from "@/lib/format";
import { useL10n } from "@/lib/l10n";
import { useInfiniteList } from "@/lib/useInfiniteList";

export interface DatasetItem {
  id: string;
  name: string;
  pool: string;
  used: string;
  available: string;
  mount: string;
  quota: string;
  usedBytes?: number;
  quotaBytes?: number;
  isOverQuota?: boolean;
  status: "Hoạt động" | "Chỉ đọc";
  createdAt: number;
}

export interface DatasetTreeNode {
  id: string;
  name: string;
  fullName: string;
  pool: string;
  isPool?: boolean;
  used: string;
  available: string;
  total?: string;
  free?: string;
  quota: string;
  usedBytes?: number;
  quotaBytes?: number;
  isOverQuota?: boolean;
  status?: "Hoạt động" | "Chỉ đọc";
  isShared?: boolean;
  dataset?: DatasetItem;
  children: DatasetTreeNode[];
}

function parseQuota(q: string): number {
  if (q === "50 GB") return 50 * 1024 * 1024 * 1024;
  if (q === "100 GB") return 100 * 1024 * 1024 * 1024;
  if (q === "250 GB") return 250 * 1024 * 1024 * 1024;
  if (q === "500 GB") return 500 * 1024 * 1024 * 1024;
  if (q === "1 TB") return 1024 * 1024 * 1024 * 1024;
  if (q === "2 TB") return 2 * 1024 * 1024 * 1024 * 1024;
  return 0;
}

const QUOTA_OPTIONS = [
  { id: "Không giới hạn", label: "Không giới hạn" },
  { id: "50 GB", label: "50 GB" },
  { id: "100 GB", label: "100 GB" },
  { id: "250 GB", label: "250 GB" },
  { id: "500 GB", label: "500 GB" },
  { id: "1 TB", label: "1 TB" },
  { id: "2 TB", label: "2 TB" },
];

export function formatDatasetBytes(b: number): string {
  if (!b || b <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  if (i === 0) return `${b} B`;
  const val = b / Math.pow(k, i);
  if (Math.abs(val - Math.round(val)) < 0.005) {
    return `${Math.round(val)} ${sizes[i]}`;
  }
  return `${val.toFixed(2).replace(".", ",")} ${sizes[i]}`;
}

export function formatProperCase(text: string): string {
  if (!text) return "";
  if (text === "DỮ LIỆU") return "Dữ liệu";
  if (text === "Ổ LƯU TRỮ") return "Ổ lưu trữ";
  if (text === "1DATA") return "1Data";
  if (text === "POOL") return "Pool";
  if (text.includes("/")) {
    return text.split("/").map((p) => formatProperCase(p)).join("/");
  }
  if (text.length > 1 && text === text.toUpperCase() && text !== text.toLowerCase()) {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }
  return text;
}

function DatasetMobileCard({
  node,
  depth,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelectNode,
  onManageQuota,
  onEditDataset,
  onDeleteDataset,
}: {
  node: DatasetTreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
  onSelectNode: (node: DatasetTreeNode) => void;
  onManageQuota: (ds: DatasetItem) => void;
  onEditDataset: (ds: DatasetItem) => void;
  onDeleteDataset: (ds: DatasetItem) => void;
}) {
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", paddingLeft: depth * 14 }}>
      <div
        onClick={() => onSelectNode(node)}
        style={{
          background: isSelected ? "rgba(76, 141, 255, 0.14)" : "var(--bg-elevated)",
          border: `1px solid ${isSelected ? "rgba(76, 141, 255, 0.4)" : "var(--stroke)"}`,
          borderRadius: 14,
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          cursor: "pointer",
        }}
      >
        {/* Dòng 1: Icon, Tên, Caret & Nút thao tác */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
            {hasChildren && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(node.id, e);
                }}
                style={{
                  width: 20,
                  height: 20,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  cursor: "pointer",
                }}
              >
                <Icon glyph={isExpanded ? "chevron-down" : "chevron-right"} size={16} color="var(--fg-secondary)" />
              </div>
            )}
            {node.isPool ? (
              <Icon glyph="drive" size={19} color="var(--accent)" />
            ) : (
              <Icon glyph="folder" size={18} color={isSelected ? "var(--accent)" : hasChildren ? "var(--accent)" : "var(--fg-secondary)"} />
            )}
            <div style={{ minWidth: 0, display: "flex", alignItems: "center" }}>
              <span
                style={{
                  fontWeight: 600,
                  color: "var(--fg-primary)",
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {formatProperCase(node.name)}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {node.dataset ? (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onManageQuota(node.dataset!);
                  }}
                  style={{
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--stroke)",
                    borderRadius: 8,
                    padding: "5px 10px",
                    color: "var(--fg-primary)",
                    fontSize: 12,
                    fontWeight: 400,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Lưu trữ
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditDataset(node.dataset!);
                  }}
                  style={{
                    background: "var(--accent, #4c8dff)",
                    border: "none",
                    borderRadius: 8,
                    padding: "5px 10px",
                    color: "#ffffff",
                    fontSize: 12,
                    fontWeight: 400,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteDataset(node.dataset!);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    padding: "5px 7px",
                    borderRadius: 6,
                    color: "var(--warning, #EF4444)",
                  }}
                >
                  <Icon glyph="trash" size={14} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Dòng 2: Dung lượng & Trạng thái */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--stroke)", paddingTop: 8, fontSize: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "var(--fg-secondary)" }}>Dung lượng:</span>
            <span style={{ fontWeight: 600, color: node.isOverQuota ? "#ef4444" : "var(--fg-primary)", fontSize: 12 }}>
              {node.isOverQuota ? `${node.used} / ${node.quota}` : `${node.used} / ${node.available}`}
            </span>
          </div>
          <span
            style={{
              padding: "2px 7px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 400,
              color: "var(--fg-primary)",
              whiteSpace: "nowrap",
            }}
          >
            Không mã hóa
          </span>
        </div>
      </div>
    </div>
  );
}

function DatasetTreeRow({
  node,
  depth,
  isLast,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelectNode,
  onManageQuota,
  onEditDataset,
  onDeleteDataset,
}: {
  node: DatasetTreeNode;
  depth: number;
  isLast: boolean;
  selectedId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (id: string, e: React.MouseEvent) => void;
  onSelectNode: (node: DatasetTreeNode) => void;
  onManageQuota: (ds: DatasetItem) => void;
  onEditDataset: (ds: DatasetItem) => void;
  onDeleteDataset: (ds: DatasetItem) => void;
}) {
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <tr
      onClick={() => onSelectNode(node)}
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--stroke)",
        background: isSelected ? "rgba(76, 141, 255, 0.14)" : "transparent",
        transition: "all 0.15s ease",
        cursor: "pointer",
        whiteSpace: "nowrap",
        verticalAlign: "middle",
      }}
    >
      {/* Cột 1: Tên bộ dữ liệu & Caret & Icon */}
      <td style={{ padding: "14px 20px", verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingLeft: depth * 28,
            minWidth: 0,
            minHeight: 32,
            overflow: "hidden",
          }}
        >
          {hasChildren ? (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id, e);
              }}
              style={{
                width: 18,
                height: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                cursor: "pointer",
              }}
            >
              <Icon
                glyph={isExpanded ? "chevron-down" : "chevron-right"}
                size={14}
                strokeWidth={2}
                color="var(--fg-secondary)"
              />
            </div>
          ) : (
            <div style={{ width: 18, height: 18, flexShrink: 0 }} />
          )}

          {node.isPool ? (
            <Icon glyph="drive" size={19} color="var(--accent)" />
          ) : (
            <Icon
              glyph="folder"
              size={18}
              color={isSelected ? "var(--accent)" : hasChildren ? "var(--accent)" : "var(--fg-secondary)"}
            />
          )}

          <span
            style={{
              fontWeight: 600,
              fontSize: 13.5,
              color: "var(--fg-primary)",
              whiteSpace: "nowrap",
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {formatProperCase(node.name)}
          </span>
        </div>
      </td>

      {/* Cột 2: Dung lượng */}
      <td
        style={{
          width: 185,
          padding: "14px 10px",
          verticalAlign: "middle",
          color: "var(--fg-primary)",
          fontSize: 13,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <div style={{ minHeight: 32, display: "flex", alignItems: "center" }}>
          <span style={{ fontWeight: 500, fontSize: 13, color: node.isOverQuota ? "#ef4444" : "var(--fg-primary)" }}>
            {node.isOverQuota ? `${node.used} / ${node.quota}` : `${node.used} / ${node.available}`}
          </span>
        </div>
      </td>

      {/* Cột 3: Mã hóa */}
      <td
        style={{
          width: 110,
          padding: "14px 10px",
          verticalAlign: "middle",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <div style={{ minHeight: 32, display: "flex", alignItems: "center" }}>
          <span style={{ color: "var(--fg-primary)", fontSize: 13, whiteSpace: "nowrap" }}>
            Không mã hóa
          </span>
        </div>
      </td>

      {/* Cột 4: Chia sẻ */}
      <td
        style={{
          width: 95,
          padding: "14px 8px",
          verticalAlign: "middle",
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 32, whiteSpace: "nowrap" }}>
          {node.isPool && node.isShared ? (
            <span
              title="Chia sẻ mạng"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(76, 141, 255, 0.1)",
                color: "var(--accent)",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              <Icon glyph="share" size={13} color="var(--accent)" />
              <span style={{ lineHeight: 1 }}>Chia sẻ</span>
            </span>
          ) : node.isShared ? (
            <span
              title="Chia sẻ Smb"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                borderRadius: 4,
                background: "rgba(76, 141, 255, 0.1)",
                color: "var(--accent)",
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: "nowrap",
                lineHeight: 1,
              }}
            >
              <Icon glyph="share" size={12} color="var(--accent)" />
              <span style={{ lineHeight: 1 }}>Smb</span>
            </span>
          ) : (
            <div style={{ height: 22, visibility: "hidden" }}>&nbsp;</div>
          )}
        </div>
      </td>

      {/* Cột 5: Thao tác */}
      <td
        style={{
          width: 250,
          padding: "14px 20px 14px 8px",
          verticalAlign: "middle",
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", minHeight: 32, whiteSpace: "nowrap" }}>
          {node.dataset ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onManageQuota(node.dataset!);
                }}
                style={{
                  background: "var(--bg-sunken)",
                  border: "1px solid var(--stroke)",
                  borderRadius: 8,
                  padding: "6px 12px",
                  color: "var(--fg-primary)",
                  fontSize: 13,
                  fontWeight: 400,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                title="Lưu trữ để quản lý dung lượng"
              >
                <Icon glyph="storage" size={14} color="var(--accent)" />
                <span>Lưu trữ</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditDataset(node.dataset!);
                }}
                style={{
                  background: "var(--accent, #4c8dff)",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 14px",
                  color: "#ffffff",
                  fontSize: 13,
                  fontWeight: 400,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
                  whiteSpace: "nowrap",
                }}
              >
                Chỉnh sửa
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteDataset(node.dataset!);
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 8px",
                  borderRadius: 6,
                  color: "var(--warning, #EF4444)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Xóa bộ dữ liệu này"
              >
                <Icon glyph="trash" size={16} />
              </button>
            </>
          ) : (
            <div style={{ height: 32, visibility: "hidden" }}>&nbsp;</div>
          )}
        </div>
      </td>
    </tr>
  );
}

export function DatasetsSection({
  onBack,
  embedded: _embedded,
}: {
  onBack?: () => void;
  embedded?: boolean;
} = {}) {
  const t = useL10n();
  const toast = useToast();
  const { isMobile } = useDeviceClass();

  // Load datasets from API with Infinite Scroll
  const {
    items: datasets,
    loading,
    reload: loadDatasets,
  } = useInfiniteList<DatasetItem>({
    pageSize: 50,
    getItemKey: (d) => d.id,
    fetchPage: async ({ offset, limit, signal }) => {
      const res = await api.get<{ datasets: any[]; has_more?: boolean; next_offset?: number; total?: number }>(
        Api.adminDatasets,
        { limit, offset },
        { signal }
      );
      const list = res?.datasets ?? [];
      const mapped = list.map((d: any) => {
        const poolName = formatProperCase(d.pool || "");
        const dsName = formatProperCase(d.name || "");
        const usedBytes = d.used_bytes || 0;
        const quotaBytes = d.quota_bytes || 0;
        const availBytes = d.available_bytes ?? (quotaBytes > 0 ? Math.max(0, quotaBytes - usedBytes) : 0);
        const isOverQuota = quotaBytes > 0 && usedBytes > quotaBytes;
        return {
          id: d.id,
          name: dsName,
          pool: poolName,
          used: formatDatasetBytes(usedBytes),
          available: availBytes > 0 ? formatDatasetBytes(availBytes) : "0 B",
          usedBytes,
          quotaBytes,
          isOverQuota,
          mount: d.mount,
          quota: d.quota_bytes > 0 ? formatDatasetBytes(d.quota_bytes) : "Không giới hạn",
          status: (d.status === "readonly" ? "Chỉ đọc" : "Hoạt động") as "Chỉ đọc" | "Hoạt động",
          createdAt: d.created_at,
        };
      });
      return {
        items: mapped,
        hasMore: Boolean(res?.has_more ?? (list.length >= limit)),
        nextOffset: res?.next_offset ?? offset + list.length,
        total: res?.total,
      };
    },
  });

  // Pools state
  const [pools, setPools] = useState<{ id: string; name: string; totalBytes?: number; usedBytes?: number }[]>([]);
  const loadPools = useCallback(async () => {
    try {
      const res = await api.get<{ pools: any[] }>(Api.adminPools);
      if (res?.pools && res.pools.length > 0) {
        setPools(
          res.pools.map((p) => ({
            id: p.id,
            name: formatProperCase(p.name),
            totalBytes: p.total_bytes,
            usedBytes: p.used_bytes,
          }))
        );
      } else {
        setPools([]);
      }
    } catch {
      setPools([]);
    }
  }, []);

  // Shared names state (for SMB badges)
  const [sharedNames, setSharedNames] = useState<Set<string>>(new Set());
  const loadShares = useCallback(async () => {
    try {
      const res = await api.get<{ shares: any[] }>(Api.adminShares);
      if (res?.shares) {
        const set = new Set<string>();
        res.shares.forEach((s) => {
          if (s.name) {
            set.add(s.name);
            set.add(formatProperCase(s.name));
          }
          if (s.path) {
            set.add(s.path);
            set.add(formatProperCase(s.path));
          }
          const base = s.path ? s.path.split(/[/\\]/).pop() : "";
          if (base) {
            set.add(base);
            set.add(formatProperCase(base));
          }
        });
        setSharedNames(set);
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadPools();
    loadShares();
  }, [loadPools, loadShares]);

  // Tree state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  // Build hierarchical dataset tree
  const treeNodes = useMemo(() => {
    const activeDatasets = datasets;

    const getDatasetRootPool = (d: DatasetItem): string => {
      const normName = formatProperCase((d.name || "").normalize("NFC").trim());
      if (normName.includes("/")) {
        return normName.split("/")[0].trim();
      }
      return formatProperCase((d.pool || pools[0]?.name || "").normalize("NFC").trim());
    };

    const poolNames = new Set<string>();
    pools.forEach((p) => {
      if (p.name) poolNames.add(formatProperCase(p.name.normalize("NFC").trim()));
    });
    activeDatasets.forEach((d) => {
      const p = getDatasetRootPool(d);
      if (p) poolNames.add(p);
    });

    if (poolNames.size === 0) {
      return [];
    }

    const roots: DatasetTreeNode[] = [];

    poolNames.forEach((poolName) => {
      const normPool = formatProperCase(poolName);
      const poolInfo = pools.find((p) => formatProperCase((p.name || "").normalize("NFC").trim()) === normPool);
      const poolDatasets = activeDatasets.filter((d) => {
        if (poolNames.size === 1) return true;
        return getDatasetRootPool(d) === normPool;
      });

      const nodeMap = new Map<string, DatasetTreeNode>();

      // Sort datasets by path depth so parents are processed cleanly
      const sortedDatasets = [...poolDatasets].sort((a, b) => a.name.localeCompare(b.name));

      const poolTotal = poolInfo?.totalBytes;
      const poolUsed = poolInfo?.usedBytes;
      const poolFree = poolTotal !== undefined && poolUsed !== undefined ? Math.max(0, poolTotal - poolUsed) : undefined;

      sortedDatasets.forEach((d) => {
        const normName = formatProperCase(d.name.normalize("NFC"));
        let rel = normName;
        if (rel.startsWith(normPool + "/")) {
          rel = rel.substring(normPool.length + 1);
        } else if (rel.startsWith(normPool)) {
          rel = rel.substring(normPool.length).replace(/^\/+/, "");
        } else if (d.pool && rel.startsWith(formatProperCase(d.pool.normalize("NFC")) + "/")) {
          rel = rel.substring(formatProperCase(d.pool.normalize("NFC")).length + 1);
        } else if (rel.includes("/")) {
          rel = rel.substring(rel.indexOf("/") + 1);
        }
        if (!rel) return;

        const parts = rel.split("/").filter(Boolean);
        let currentPath = "";

        parts.forEach((part, idx) => {
          const properPart = formatProperCase(part);
          const isLeaf = idx === parts.length - 1;
          const parentPath = currentPath;
          currentPath = currentPath ? `${currentPath}/${properPart}` : properPart;

          if (!nodeMap.has(currentPath)) {
            const isShared = isLeaf
              ? (sharedNames.has(d.name) || sharedNames.has(d.mount) || sharedNames.has(properPart) || sharedNames.has(part))
              : (sharedNames.has(properPart) || sharedNames.has(part));
            const node: DatasetTreeNode = {
              id: isLeaf ? d.id : `virt-${normPool}-${currentPath}`,
              name: properPart,
              fullName: `${normPool}/${currentPath}`,
              pool: normPool,
              isPool: false,
              used: isLeaf ? d.used : "0 B",
              available: isLeaf ? d.available : (poolFree !== undefined ? formatDatasetBytes(poolFree) : "0 B"),
              quota: isLeaf ? d.quota : "Không giới hạn",
              usedBytes: isLeaf ? d.usedBytes : 0,
              quotaBytes: isLeaf ? d.quotaBytes : 0,
              isOverQuota: isLeaf ? d.isOverQuota : false,
              status: isLeaf ? d.status : "Hoạt động",
              isShared,
              dataset: isLeaf
                ? d
                : {
                    id: `virt-${normPool}-${currentPath}`,
                    name: `${normPool}/${currentPath}`,
                    pool: normPool,
                    used: "0 B",
                    available: poolFree !== undefined ? formatDatasetBytes(poolFree) : "0 B",
                    mount: `/mnt/${normPool}/${currentPath}`,
                    quota: "Không giới hạn",
                    status: "Hoạt động",
                    createdAt: Date.now(),
                  },
              children: [],
            };
            nodeMap.set(currentPath, node);

            if (parentPath && nodeMap.has(parentPath)) {
              nodeMap.get(parentPath)!.children.push(node);
            }
          } else if (isLeaf) {
            const existing = nodeMap.get(currentPath)!;
            existing.id = d.id;
            existing.used = d.used;
            existing.available = d.available;
            existing.quota = d.quota;
            existing.usedBytes = d.usedBytes;
            existing.quotaBytes = d.quotaBytes;
            existing.isOverQuota = d.isOverQuota;
            existing.status = d.status;
            existing.isShared = sharedNames.has(d.name) || sharedNames.has(d.mount) || sharedNames.has(properPart) || sharedNames.has(part);
            existing.dataset = d;
          }
        });
      });

      const topLevelChildren: DatasetTreeNode[] = [];
      nodeMap.forEach((node, path) => {
        if (!path.includes("/")) {
          topLevelChildren.push(node);
        }
      });

      const poolNode: DatasetTreeNode = {
        id: `pool-${normPool}`,
        name: normPool,
        fullName: normPool,
        pool: normPool,
        isPool: true,
        used: poolUsed !== undefined ? formatDatasetBytes(poolUsed) : "0 B",
        available: poolFree !== undefined ? formatDatasetBytes(poolFree) : "0 B",
        total: poolTotal !== undefined ? formatDatasetBytes(poolTotal) : "0 B",
        free: poolFree !== undefined ? formatDatasetBytes(poolFree) : "0 B",
        quota: "Không giới hạn",
        status: "Hoạt động",
        isShared: sharedNames.has(poolName) || sharedNames.has(normPool),
        children: topLevelChildren,
      };

      roots.push(poolNode);
    });

    return roots;
  }, [pools, datasets, sharedNames]);

  // Scroll to top on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
  }, []);

  // Pre-expand parent nodes on load
  useEffect(() => {
    const parentIds = new Set<string>();
    const scan = (nodes: DatasetTreeNode[]) => {
      nodes.forEach((n) => {
        if (n.children && n.children.length > 0) {
          parentIds.add(n.id);
          scan(n.children);
        }
      });
    };
    scan(treeNodes);
    if (parentIds.size > 0) {
      setExpandedNodeIds((prev) => new Set([...prev, ...parentIds]));
    }
  }, [treeNodes]);

  // Find currently selected node
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    const findNode = (nodes: DatasetTreeNode[]): DatasetTreeNode | null => {
      for (const n of nodes) {
        if (n.id === selectedNodeId) return n;
        if (n.children && n.children.length > 0) {
          const res = findNode(n.children);
          if (res) return res;
        }
      }
      return null;
    };
    return findNode(treeNodes);
  }, [selectedNodeId, treeNodes]);

  // Flatten visible nodes based on expanded state for linear rendering and exact isLast determination
  const visibleNodes = useMemo(() => {
    const list: { node: DatasetTreeNode; depth: number }[] = [];
    const walk = (nodes: DatasetTreeNode[], depth: number) => {
      nodes.forEach((n) => {
        list.push({ node: n, depth });
        if (n.children && n.children.length > 0 && expandedNodeIds.has(n.id)) {
          walk(n.children, depth + 1);
        }
      });
    };
    walk(treeNodes, 0);
    return list;
  }, [treeNodes, expandedNodeIds]);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalItem, setEditModalItem] = useState<DatasetItem | null>(null);
  const [deleteModalItem, setDeleteModalItem] = useState<DatasetItem | null>(null);
  const [quotaModalItem, setQuotaModalItem] = useState<DatasetItem | null>(null);

  // Form state for creating new dataset
  const [newDsName, setNewDsName] = useState("");
  const [newDsPool, setNewDsPool] = useState("Dữ liệu");
  const [newDsQuota, setNewDsQuota] = useState("Không giới hạn");
  const [createPoolDropdownOpen, setCreatePoolDropdownOpen] = useState(false);
  const [createQuotaDropdownOpen, setCreateQuotaDropdownOpen] = useState(false);

  // Form state for editing dataset
  const [editDsName, setEditDsName] = useState("");
  const [editDsPool, setEditDsPool] = useState("Dữ liệu");
  const [editDsQuota, setEditDsQuota] = useState("Không giới hạn");
  const [editPoolDropdownOpen, setEditPoolDropdownOpen] = useState(false);
  const [editQuotaDropdownOpen, setEditQuotaDropdownOpen] = useState(false);

  // Form state for quota management modal
  const [quotaSelectedOption, setQuotaSelectedOption] = useState<string>("Không giới hạn");
  const [quotaDropdownOpen, setQuotaDropdownOpen] = useState(false);

  const POOL_OPTIONS = useMemo(() => {
    if (pools.length > 0) {
      return pools.map((p) => ({ id: formatProperCase(p.name), label: `Mảng ${formatProperCase(p.name)}` }));
    }
    return [];
  }, [pools]);

  const handleOpenCreateModal = (targetNode?: DatasetTreeNode | null) => {
    if (pools.length === 0) {
      toast("Chưa có Nhóm lưu trữ (Storage Pool). Vui lòng tạo Nhóm lưu trữ trước khi thêm Tập dữ liệu!", "error");
      return;
    }
    const nodeToUse = targetNode !== undefined ? targetNode : selectedNode;
    setNewDsName("");
    setNewDsQuota("Không giới hạn");
    if (nodeToUse) {
      setNewDsPool(formatProperCase(nodeToUse.pool || pools[0]?.name || ""));
    } else {
      setNewDsPool(formatProperCase(pools[0]?.name || ""));
    }
    setCreatePoolDropdownOpen(false);
    setCreateQuotaDropdownOpen(false);
    setCreateModalOpen(true);
  };

  const handleToggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectNode = (node: DatasetTreeNode) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
    if (node.children && node.children.length > 0) {
      setExpandedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%", paddingBottom: isMobile ? 110 : 60 }}>
      {/* Top action row: Tiêu đề & Nút Thêm */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onBack && (
            <Tappable
              onClick={onBack}
              radius={999}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                background: "var(--bg-elevated)",
                border: "1px solid var(--stroke)",
                borderRadius: "50%",
                cursor: "pointer",
                color: "var(--fg-secondary)",
              }}
              title="Quay lại"
            >
              <Icon glyph="chevron-left" size={18} />
            </Tappable>
          )}
          <Icon glyph="folder" size={22} color="var(--accent)" />
          <h2 className="t-title-md" style={{ margin: 0, fontWeight: 600, color: "var(--fg-primary)", fontSize: 18 }}>
            {t.settingsDatasets}
          </h2>
        </div>
        {pools.length > 0 && visibleNodes.length > 0 && (
          <Button
            label="Thêm"
            glyph="plus"
            variant="primary"
            compact
            expand={false}
            onClick={() => handleOpenCreateModal()}
          />
        )}
      </div>

      {/* Cấu trúc Tập dữ liệu */}
      {loading && visibleNodes.length === 0 ? (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card, 14px)",
            padding: "36px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Spinner size={26} color="var(--accent)" />
          </div>
        </div>
      ) : pools.length === 0 ? (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card, 14px)",
            padding: "36px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon glyph="storage" size={26} color="var(--fg-secondary)" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-primary)", whiteSpace: "nowrap" }}>
            Chưa có Nhóm lưu trữ nào
          </div>
          <div style={{ fontSize: 13.5, color: "var(--fg-secondary)", maxWidth: "none", lineHeight: 1.5, whiteSpace: "nowrap" }}>
            Hệ thống cần ít nhất một Nhóm lưu trữ để có thể tạo Tập dữ liệu và bắt đầu lưu trữ tệp tin.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Button
              label="Đi đến Nhóm lưu trữ"
              variant="primary"
              compact
              expand={false}
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.history.pushState(null, "", "/settings/storage_pools");
                  window.dispatchEvent(new PopStateEvent("popstate"));
                }
              }}
            />
          </div>
        </div>
      ) : visibleNodes.length === 0 ? (
        <div
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card, 14px)",
            padding: "36px 20px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon glyph="folder" size={26} color="var(--fg-secondary)" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fg-primary)", whiteSpace: "nowrap" }}>
            Chưa có Tập dữ liệu nào
          </div>
          <div style={{ fontSize: 13.5, color: "var(--fg-secondary)", maxWidth: "none", lineHeight: 1.5, whiteSpace: "nowrap" }}>
            Bạn có thể tạo mới Tập dữ liệu để bắt đầu lưu trữ tệp tin và phân quyền người dùng.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Button
              label="Thêm"
              glyph="plus"
              compact
              expand={false}
              onClick={() => handleOpenCreateModal()}
            />
          </div>
        </div>
      ) : isMobile ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleNodes.map(({ node, depth }) => (
            <DatasetMobileCard
              key={node.id}
              node={node}
              depth={depth}
              selectedId={selectedNodeId}
              expandedIds={expandedNodeIds}
              onToggleExpand={handleToggleExpand}
              onSelectNode={handleSelectNode}
              onManageQuota={(ds) => {
                setQuotaModalItem(ds);
                setQuotaSelectedOption(ds.quota || "Không giới hạn");
                setQuotaDropdownOpen(false);
              }}
              onEditDataset={(ds) => {
                const parts = ds.name.split("/");
                setEditDsName(parts[parts.length - 1] || parts[0]);
                setEditDsPool(ds.pool);
                setEditDsQuota(ds.quota || "Không giới hạn");
                setEditPoolDropdownOpen(false);
                setEditQuotaDropdownOpen(false);
                setEditModalItem(ds);
              }}
              onDeleteDataset={(ds) => setDeleteModalItem(ds)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            background: "var(--bg-elevated)",
            border: "1px solid var(--stroke)",
            borderRadius: "var(--r-card, 14px)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflowX: "auto", width: "100%", scrollbarWidth: "none" }}>
            <table
              style={{
                width: "100%",
                minWidth: 880,
                tableLayout: "fixed",
                borderCollapse: "collapse",
                textAlign: "left",
                fontSize: 13,
              }}
            >
              <colgroup>
                <col style={{ width: "auto" }} />
                <col style={{ width: 185 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 250 }} />
              </colgroup>
              <tbody>
                {visibleNodes.map(({ node, depth }, idx) => (
                  <DatasetTreeRow
                    key={node.id}
                    node={node}
                    depth={depth}
                    isLast={idx === visibleNodes.length - 1}
                    selectedId={selectedNodeId}
                    expandedIds={expandedNodeIds}
                    onToggleExpand={handleToggleExpand}
                    onSelectNode={handleSelectNode}
                    onManageQuota={(ds) => {
                      setQuotaModalItem(ds);
                      setQuotaSelectedOption(ds.quota || "Không giới hạn");
                      setQuotaDropdownOpen(false);
                    }}
                    onEditDataset={(ds) => {
                      const parts = ds.name.split("/");
                      setEditDsName(parts[parts.length - 1] || parts[0]);
                      setEditDsPool(ds.pool);
                      setEditDsQuota(ds.quota || "Không giới hạn");
                      setEditPoolDropdownOpen(false);
                      setEditQuotaDropdownOpen(false);
                      setEditModalItem(ds);
                    }}
                    onDeleteDataset={(ds) => setDeleteModalItem(ds)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Thêm Tập dữ liệu mới */}
      {createModalOpen && (
        <Dialog
          open={createModalOpen}
          onClose={() => {
            setCreateModalOpen(false);
            setCreatePoolDropdownOpen(false);
            setCreateQuotaDropdownOpen(false);
          }}
          maxWidth={500}
          overflow="visible"
          title="Thêm"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Nhập tên */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Tên tập dữ liệu mới:</span>
              <TextField
                hint="Tên tập dữ liệu"
                value={newDsName}
                onChange={setNewDsName}
              />
              <div
                style={{
                  fontSize: 12,
                  color: "var(--fg-secondary)",
                  background: "var(--bg-sunken)",
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px dashed var(--stroke)",
                  fontFamily: "monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <Icon glyph="folder" size={13} color="var(--accent)" />
                <span>
                  Đường dẫn: /mnt/
                  {selectedNode
                    ? `${selectedNode.isPool ? selectedNode.name : selectedNode.fullName}/${newDsName.trim().replace(/^\/+|\/+$/g, "")}`
                    : `${newDsPool}/${newDsName.trim().replace(/^\/+|\/+$/g, "")}`}
                </span>
              </div>
            </div>

            {/* Mảng lưu trữ: Nếu đã chọn 1 mục ở bảng thì hiện thẳng trực tiếp, không cần dropdown */}
            {selectedNode ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Mảng / Thư mục lưu trữ gốc:</span>
                <div
                  style={{
                    padding: "10px 14px",
                    background: "var(--bg-sunken)",
                    border: "1px solid var(--stroke)",
                    borderRadius: "var(--r-field, 12px)",
                    fontSize: 13,
                    fontWeight: 400,
                    color: "var(--fg-primary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon glyph={selectedNode.isPool ? "storage" : "folder"} size={16} color="var(--accent)" />
                    <span>{selectedNode.isPool ? selectedNode.name : selectedNode.fullName}</span>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "rgba(76, 141, 255, 0.12)",
                      color: "var(--accent)",
                      fontWeight: 500,
                    }}
                  >
                    Đã chọn từ bảng
                  </span>
                </div>
              </div>
            ) : (
              /* Chọn Mảng lưu trữ gốc (Dropdown chỉ hiện khi chưa chọn mục nào ở bảng) */
              <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Chọn Mảng lưu trữ gốc:</span>
                <button
                  type="button"
                  onClick={() => setCreatePoolDropdownOpen((prev) => !prev)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--bg-elevated)",
                    border: `1px solid ${createPoolDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                    borderRadius: "var(--r-field, 12px)",
                    cursor: "pointer",
                    color: "var(--fg-primary)",
                    textAlign: "left",
                    boxSizing: "border-box",
                    outline: "none",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Icon glyph="storage" size={16} color="var(--accent)" />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>
                      {POOL_OPTIONS.find((p) => p.id === newDsPool)?.label || `Mảng ${newDsPool}`}
                    </span>
                  </div>
                  <Icon glyph={createPoolDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-secondary)" />
                </button>

                {createPoolDropdownOpen && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setCreatePoolDropdownOpen(false)} />
                    <div
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        zIndex: 999,
                        background: "var(--bg-elevated)",
                        border: "1px solid var(--stroke)",
                        borderRadius: "var(--r-card, 16px)",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                        padding: 6,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      {POOL_OPTIONS.map((p) => {
                        const isSelected = newDsPool === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => {
                              setNewDsPool(p.id);
                              setCreatePoolDropdownOpen(false);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 12px",
                              borderRadius: "var(--r-chip, 10px)",
                              background: isSelected ? "rgba(76, 141, 255, 0.1)" : "transparent",
                              color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                              fontWeight: isSelected ? 600 : 400,
                              fontSize: 13,
                              cursor: "pointer",
                            }}
                          >
                            <span>{p.label}</span>
                            {isSelected && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Chọn Hạn ngạch Quota */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Hạn ngạch lưu trữ Quota:</span>
              <button
                type="button"
                onClick={() => setCreateQuotaDropdownOpen((prev) => !prev)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${createQuotaDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                  borderRadius: "var(--r-field, 12px)",
                  cursor: "pointer",
                  color: "var(--fg-primary)",
                  textAlign: "left",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {QUOTA_OPTIONS.find((q) => q.id === newDsQuota)?.label || newDsQuota}
                </span>
                <Icon glyph={createQuotaDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-secondary)" />
              </button>

              {createQuotaDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setCreateQuotaDropdownOpen(false)} />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 999,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "var(--r-card, 16px)",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {QUOTA_OPTIONS.map((q) => {
                      const isSelected = newDsQuota === q.id;
                      return (
                        <div
                          key={q.id}
                          onClick={() => {
                            setNewDsQuota(q.id);
                            setCreateQuotaDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "var(--r-chip, 10px)",
                            background: isSelected ? "rgba(76, 141, 255, 0.1)" : "transparent",
                            color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                            fontWeight: isSelected ? 500 : 400,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <span>{q.label}</span>
                          {isSelected && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button label="Hủy" variant="secondary" compact expand={false} onClick={() => setCreateModalOpen(false)} />
              <Button
                label="Thêm"
                variant="primary"
                compact
                expand={false}
                onClick={async () => {
                  const clean = newDsName.trim().replace(/^\/+|\/+$/g, "");
                  if (!clean) {
                    toast("Vui lòng nhập tên bộ dữ liệu!", "error");
                    return;
                  }

                  let fullName = "";
                  let targetPool = newDsPool;
                  if (selectedNode) {
                    targetPool = selectedNode.pool || newDsPool;
                    if (selectedNode.isPool) {
                      fullName = `${selectedNode.name}/${clean}`;
                    } else {
                      fullName = `${selectedNode.fullName}/${clean}`;
                    }
                  } else {
                    fullName = `${newDsPool}/${clean}`;
                  }

                  if (datasets.some((d) => d.name.toLowerCase() === fullName.toLowerCase())) {
                    toast(`Bộ dữ liệu "${fullName}" đã tồn tại!`, "error");
                    return;
                  }

                  try {
                    const quotaBytes = parseQuota(newDsQuota);
                    await api.post(Api.adminDatasets, {
                      name: fullName,
                      pool: targetPool,
                      mount: `/mnt/${fullName}`,
                      quota_bytes: quotaBytes,
                    });
                    await loadDatasets();
                    if (selectedNode) {
                      setExpandedNodeIds((prev) => new Set([...prev, selectedNode.id]));
                    }
                    setCreateModalOpen(false);
                    toast(`Đã tạo bộ dữ liệu "${fullName}" thành công!`, "success");
                  } catch (e: any) {
                    toast(e?.message || "Lỗi tạo bộ dữ liệu trên máy chủ", "error");
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal 2: Quản lý dung lượng lưu trữ (Lưu trữ để quản lý dung lượng) */}
      {quotaModalItem && (
        <Dialog
          open={!!quotaModalItem}
          onClose={() => {
            setQuotaModalItem(null);
            setQuotaDropdownOpen(false);
          }}
          maxWidth={500}
          overflow="visible"
          title="Quản lý dung lượng lưu trữ"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Thông tin bộ dữ liệu */}
            <div
              style={{
                padding: "12px 14px",
                background: "var(--bg-sunken)",
                border: "1px solid var(--stroke)",
                borderRadius: 10,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                fontSize: 13,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--fg-secondary)" }}>Tên bộ dữ liệu:</span>
                <span style={{ fontWeight: 500, color: "var(--fg-primary)" }}>{quotaModalItem.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--fg-secondary)" }}>Mảng lưu trữ:</span>
                <span style={{ fontWeight: 500, color: "var(--accent)" }}>{quotaModalItem.pool}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--fg-secondary)" }}>Dung lượng đã dùng:</span>
                <span style={{ fontWeight: 500, color: "var(--fg-primary)" }}>{quotaModalItem.used}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--fg-secondary)" }}>Khả dụng trên mảng:</span>
                <span style={{ fontWeight: 500, color: "var(--fg-primary)" }}>{quotaModalItem.available || "288.76 GiB"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--fg-secondary)" }}>Hạn ngạch hiện tại:</span>
                <span style={{ fontWeight: 500, color: "var(--fg-primary)" }}>{quotaModalItem.quota}</span>
              </div>
            </div>

            {/* Chọn hạn ngạch mới */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>
                Thiết lập hạn ngạch dung lượng (Quota):
              </span>
              <button
                type="button"
                onClick={() => setQuotaDropdownOpen((prev) => !prev)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${quotaDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                  borderRadius: "var(--r-field, 12px)",
                  cursor: "pointer",
                  color: "var(--fg-primary)",
                  textAlign: "left",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {QUOTA_OPTIONS.find((q) => q.id === quotaSelectedOption)?.label || quotaSelectedOption}
                </span>
                <Icon glyph={quotaDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-secondary)" />
              </button>

              {quotaDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setQuotaDropdownOpen(false)} />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 999,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "var(--r-card, 16px)",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {QUOTA_OPTIONS.map((q) => {
                      const isSelected = quotaSelectedOption === q.id;
                      return (
                        <div
                          key={q.id}
                          onClick={() => {
                            setQuotaSelectedOption(q.id);
                            setQuotaDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "var(--r-chip, 10px)",
                            background: isSelected ? "rgba(76, 141, 255, 0.1)" : "transparent",
                            color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                            fontWeight: isSelected ? 500 : 400,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <span>{q.label}</span>
                          {isSelected && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {(() => {
              const selectedBytes = parseQuota(quotaSelectedOption);
              const usedBytes = (quotaModalItem as any)?.usedBytes || 0;
              if (selectedBytes > 0 && usedBytes > selectedBytes) {
                return (
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: "rgba(239, 68, 68, 0.08)",
                      border: "1px solid rgba(239, 68, 68, 0.25)",
                      color: "#ef4444",
                      fontSize: 12.5,
                      lineHeight: 1.45,
                    }}
                  >
                    Hạn ngạch bạn chọn ({quotaSelectedOption}) nhỏ hơn dung lượng hiện đang sử dụng ({quotaModalItem.used}). Dữ liệu đã lưu vẫn được bảo toàn nguyên vẹn, hệ thống sẽ chỉ tạm ngưng tải thêm dữ liệu mới cho đến khi mở rộng thêm dung lượng.
                  </div>
                );
              }
              return null;
            })()}

            {/* Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button label="Hủy" variant="secondary" compact expand={false} onClick={() => setQuotaModalItem(null)} />
              <Button
                label="Lưu dung lượng"
                variant="primary"
                compact
                expand={false}
                onClick={async () => {
                  try {
                    const bytesVal = parseQuota(quotaSelectedOption);
                    await api.patch(Api.adminDataset(quotaModalItem.id), {
                      quota_bytes: bytesVal,
                    });
                    await loadDatasets();
                    setQuotaModalItem(null);
                    toast(`Đã cập nhật dung lượng cho "${quotaModalItem.name}" thành công!`, "success");
                  } catch (e: any) {
                    toast(e?.message || "Lỗi cập nhật dung lượng", "error");
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal 3: Chỉnh sửa Bộ dữ liệu */}
      {editModalItem && (
        <Dialog
          open={!!editModalItem}
          onClose={() => {
            setEditModalItem(null);
            setEditPoolDropdownOpen(false);
            setEditQuotaDropdownOpen(false);
          }}
          maxWidth={500}
          overflow="visible"
          title="Chỉnh sửa"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Nhập tên */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Tên bộ dữ liệu:</span>
              <TextField
                hint="Tên bộ dữ liệu"
                value={editDsName}
                onChange={setEditDsName}
              />
            </div>

            {/* Chọn Mảng lưu trữ (Pool) */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Chọn Mảng lưu trữ gốc:</span>
              <button
                type="button"
                onClick={() => setEditPoolDropdownOpen((prev) => !prev)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${editPoolDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                  borderRadius: "var(--r-field, 12px)",
                  cursor: "pointer",
                  color: "var(--fg-primary)",
                  textAlign: "left",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Icon glyph="storage" size={16} color="var(--accent)" />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>
                    {POOL_OPTIONS.find((p) => p.id === editDsPool)?.label || `Mảng ${editDsPool}`}
                  </span>
                </div>
                <Icon glyph={editPoolDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-secondary)" />
              </button>

              {editPoolDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setEditPoolDropdownOpen(false)} />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 999,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "var(--r-card, 16px)",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {POOL_OPTIONS.map((p) => {
                      const isSelected = editDsPool === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setEditDsPool(p.id);
                            setEditPoolDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "var(--r-chip, 10px)",
                            background: isSelected ? "rgba(76, 141, 255, 0.1)" : "transparent",
                            color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                            fontWeight: isSelected ? 500 : 400,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <span>{p.label}</span>
                          {isSelected && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Chọn Hạn ngạch Quota */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg-primary)" }}>Hạn ngạch lưu trữ Quota:</span>
              <button
                type="button"
                onClick={() => setEditQuotaDropdownOpen((prev) => !prev)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: `1px solid ${editQuotaDropdownOpen ? "var(--accent)" : "var(--stroke)"}`,
                  borderRadius: "var(--r-field, 12px)",
                  cursor: "pointer",
                  color: "var(--fg-primary)",
                  textAlign: "left",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {QUOTA_OPTIONS.find((q) => q.id === editDsQuota)?.label || editDsQuota}
                </span>
                <Icon glyph={editQuotaDropdownOpen ? "chevron-up" : "chevron-down"} size={16} color="var(--fg-secondary)" />
              </button>

              {editQuotaDropdownOpen && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 998 }} onClick={() => setEditQuotaDropdownOpen(false)} />
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: 0,
                      right: 0,
                      zIndex: 999,
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "var(--r-card, 16px)",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                      padding: 6,
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {QUOTA_OPTIONS.map((q) => {
                      const isSelected = editDsQuota === q.id;
                      return (
                        <div
                          key={q.id}
                          onClick={() => {
                            setEditDsQuota(q.id);
                            setEditQuotaDropdownOpen(false);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            borderRadius: "var(--r-chip, 10px)",
                            background: isSelected ? "rgba(76, 141, 255, 0.1)" : "transparent",
                            color: isSelected ? "var(--accent)" : "var(--fg-primary)",
                            fontWeight: isSelected ? 500 : 400,
                            fontSize: 13,
                            cursor: "pointer",
                          }}
                        >
                          <span>{q.label}</span>
                          {isSelected && <Icon glyph="check" size={14} color="var(--accent)" strokeWidth={2.5} />}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <Button label="Hủy" variant="secondary" compact expand={false} onClick={() => setEditModalItem(null)} />
              <Button
                label="Chỉnh sửa"
                variant="primary"
                compact
                expand={false}
                onClick={async () => {
                  if (!editModalItem) return;
                  const trimmed = editDsName.trim();
                  if (!trimmed) {
                    toast("Vui lòng nhập tên bộ dữ liệu!", "error");
                    return;
                  }
                  // Giữ nguyên đường dẫn danh mục cha nếu là danh mục lồng nhau (ví dụ DATA/KiyoVN/Long_4 -> DATA/KiyoVN/Long)
                  const lastSlash = editModalItem.name.lastIndexOf("/");
                  const parentPrefix = lastSlash > 0 ? editModalItem.name.substring(0, lastSlash) : editDsPool;
                  const fullName = `${parentPrefix}/${trimmed}`;

                  try {
                    const quotaBytes = parseQuota(editDsQuota);
                    await api.patch(Api.adminDataset(editModalItem.id), {
                      name: fullName,
                      quota_bytes: quotaBytes,
                    });
                    await loadDatasets();
                    setEditModalItem(null);
                    if (typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("ld_datasets_updated"));
                      window.dispatchEvent(new CustomEvent("ld_nodes_changed"));
                    }
                    toast(`Đã cập nhật bộ dữ liệu "${fullName}" thành công!`, "success");
                  } catch (e: any) {
                    toast(e?.message || "Lỗi cập nhật bộ dữ liệu", "error");
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* Modal 4: Xóa Bộ dữ liệu */}
      {deleteModalItem && (
        <Dialog
          open={!!deleteModalItem}
          onClose={() => setDeleteModalItem(null)}
          maxWidth={460}
          title="Xác nhận xóa bộ dữ liệu"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 10,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--fg-primary)",
              }}
            >
              Bạn có chắc chắn muốn xóa bộ dữ liệu <b>{deleteModalItem.name}</b>?<br />
              Tất cả tệp tin và thư mục con trong bộ dữ liệu này sẽ bị hủy bỏ vĩnh viễn.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 6 }}>
              <Button label="Hủy" variant="secondary" compact expand={false} onClick={() => setDeleteModalItem(null)} />
              <Button
                label="Xác nhận xóa"
                variant="danger"
                compact
                expand={false}
                onClick={async () => {
                  try {
                    await api.del(Api.adminDataset(deleteModalItem.id));
                    await loadDatasets();
                    setDeleteModalItem(null);
                    toast(`Đã xóa bộ dữ liệu "${deleteModalItem.name}" thành công!`, "success");
                  } catch (e: any) {
                    toast(e?.message || "Lỗi xóa bộ dữ liệu", "error");
                  }
                }}
              />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
