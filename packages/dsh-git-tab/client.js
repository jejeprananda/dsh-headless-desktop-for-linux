window.__ModuleLoader__.load({
  id: "dsh-git-tab",
  factory: (require) => {
    const module = { exports: {} };
    const React = require("react");
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    // Id implementasi tab kanan; sekaligus key body dan title-nya.
    const TAB_ID = "dsh-git-tab";
    const TAB_KIND = "git";
    const RELATIVE = new Intl.RelativeTimeFormat("id", { numeric: "auto" });

    async function api(path, params) {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries(params || {})) {
        if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
      }
      const response = await fetch(`${path}?${search.toString()}`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error?.message || `HTTP ${response.status}`);
      return data;
    }

    function ageLabel(iso) {
      if (!iso) return "";
      const then = new Date(iso).getTime();
      if (!Number.isFinite(then)) return "";
      const seconds = Math.round((then - Date.now()) / 1000);
      const abs = Math.abs(seconds);
      if (abs < 60) return RELATIVE.format(seconds, "second");
      const minutes = Math.round(seconds / 60);
      if (Math.abs(minutes) < 60) return RELATIVE.format(minutes, "minute");
      const hours = Math.round(minutes / 60);
      if (Math.abs(hours) < 24) return RELATIVE.format(hours, "hour");
      const days = Math.round(hours / 24);
      if (Math.abs(days) < 30) return RELATIVE.format(days, "day");
      const months = Math.round(days / 30);
      if (Math.abs(months) < 12) return RELATIVE.format(months, "month");
      return RELATIVE.format(Math.round(days / 365), "year");
    }

    const STATUS_COLORS = {
      M: "#ffb224",
      A: "#46a758",
      D: "#e5484d",
      R: "#0091ff",
      C: "#0091ff",
      U: "#e5484d",
      "?": "#8d8d8d",
    };

    function statusColor(status) {
      if (status === "??") return STATUS_COLORS["?"];
      const first = String(status || "").trim()[0] || "?";
      return STATUS_COLORS[first] || "#9b9ba1";
    }

    function FolderGlyph() {
      return h(
        "svg",
        {
          width: 13,
          height: 13,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.3,
          "aria-hidden": true,
          style: { flex: "0 0 auto", color: "var(--dsw-alias-label-tertiary, #77777d)" },
        },
        h("path", { d: "M1.8 4.2c0-.7.6-1.2 1.2-1.2h2.6l1.3 1.5h6.1c.7 0 1.2.6 1.2 1.2v6.1c0 .7-.6 1.2-1.2 1.2H3c-.7 0-1.2-.6-1.2-1.2z" }),
      );
    }

    function BranchGlyph() {
      return h(
        "svg",
        {
          width: 11,
          height: 11,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          "aria-hidden": true,
          style: { flex: "0 0 auto" },
        },
        h("circle", { cx: 4.6, cy: 3.6, r: 1.5 }),
        h("circle", { cx: 4.6, cy: 12.4, r: 1.5 }),
        h("circle", { cx: 11.4, cy: 6.6, r: 1.5 }),
        h("path", { d: "M4.6 5.1v5.8M11.4 8.1v.4c0 2-1.6 3.6-3.6 3.6H5.9" }),
      );
    }

    function StatusBadge({ status }) {
      return h(
        "span",
        {
          style: {
            flex: "0 0 auto",
            minWidth: 22,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 4px",
            borderRadius: 4,
            color: statusColor(status),
            border: `1px solid color-mix(in srgb, ${statusColor(status)} 40%, transparent)`,
            background: `color-mix(in srgb, ${statusColor(status)} 12%, transparent)`,
            fontFamily: "var(--dsw-font-mono, ui-monospace, monospace)",
            fontSize: 10,
            fontWeight: 650,
          },
        },
        status === "??" ? "U" : status.trim() || "?",
      );
    }

    const styles = {
      page: {
        boxSizing: "border-box",
        height: "100%",
        overflow: "auto",
        padding: "10px 10px 24px",
        color: "inherit",
        font: "inherit",
      },
      // Toolbar sempit khas panel kanan: satu select fleksibel + tombol ikon.
      toolbar: {
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginBottom: 8,
      },
      select: {
        flex: "1 1 auto",
        minWidth: 0,
        height: 26,
        padding: "0 6px",
        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28))",
        borderRadius: 7,
        background: "var(--dsw-specific-input-major, rgba(255,255,255,.04))",
        color: "inherit",
        font: "inherit",
        fontSize: 11.5,
      },
      iconButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "0 0 auto",
        width: 26,
        height: 26,
        padding: 0,
        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28))",
        borderRadius: 7,
        background: "transparent",
        color: "var(--dsw-alias-label-secondary, #9b9ba1)",
        cursor: "pointer",
      },
      rootPath: {
        fontFamily: "var(--dsw-font-mono, ui-monospace, monospace)",
        color: "var(--dsw-alias-label-tertiary, #77777d)",
        fontSize: 10,
        lineHeight: "14px",
        marginBottom: 10,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      header: {
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
      },
      title: { margin: 0, fontSize: 19, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: "26px" },
      subtitle: {
        margin: "2px 0 0",
        color: "var(--dsw-alias-label-secondary, #9b9ba1)",
        fontSize: 12.5,
        lineHeight: "18px",
      },
      ghost: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        height: 28,
        padding: "0 9px",
        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28))",
        borderRadius: 7,
        background: "transparent",
        color: "var(--dsw-alias-label-secondary, #9b9ba1)",
        font: "inherit",
        fontSize: 12,
        cursor: "pointer",
        whiteSpace: "nowrap",
      },
      card: {
        border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.22))",
        borderRadius: 12,
        background: "var(--dsw-alias-bg-elevated, rgba(255,255,255,.02))",
        marginBottom: 12,
        overflow: "hidden",
      },
      muted: { margin: 0, color: "var(--dsw-alias-label-tertiary, #77777d)", fontSize: 12, lineHeight: "18px" },
      mono: { fontFamily: "var(--dsw-font-mono, ui-monospace, monospace)" },
      banner: {
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(239,68,68,.12)",
        color: "var(--dsw-alias-state-danger, #ef4444)",
        fontSize: 12.5,
        lineHeight: "18px",
        marginBottom: 12,
      },
    };

    function TabButton({ active, onClick, children, count }) {
      return h(
        "button",
        {
          type: "button",
          onClick,
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            height: 30,
            padding: "0 10px",
            border: "none",
            borderBottom: active ? "2px solid var(--dsw-alias-state-business-primary, #3b82f6)" : "2px solid transparent",
            background: "transparent",
            color: active ? "inherit" : "var(--dsw-alias-label-tertiary, #77777d)",
            font: "inherit",
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            cursor: "pointer",
          },
        },
        children,
        count !== undefined &&
          h(
            "span",
            {
              style: {
                minWidth: 16,
                padding: "0 4px",
                borderRadius: 999,
                background: "var(--dsw-alias-bg-module-platform, rgba(255,255,255,.06))",
                fontSize: 10.5,
                lineHeight: "16px",
                textAlign: "center",
              },
            },
            String(count),
          ),
      );
    }

    // Warna diff memakai token tema, bukan hex tetap: di tema terang baris
    // konteks berwarna #c9c9cf nyaris tak terbaca di atas latar putih.
    function lineStyle(line) {
      const secondary = "var(--dsw-alias-label-secondary, #9b9ba1)";
      const primary = "var(--dsw-alias-label-primary, inherit)";
      if (line.startsWith("+++") || line.startsWith("---")) return { color: secondary };
      if (line.startsWith("+"))
        return {
          color: "var(--dsw-alias-state-success-primary, #46a758)",
          background: "color-mix(in srgb, var(--dsw-alias-state-success-primary, #46a758) 9%, transparent)",
        };
      if (line.startsWith("-"))
        return {
          color: "var(--dsw-alias-state-error-primary, #e5484d)",
          background: "color-mix(in srgb, var(--dsw-alias-state-error-primary, #e5484d) 9%, transparent)",
        };
      if (line.startsWith("@@")) return { color: "var(--dsw-alias-brand-primary, #0091ff)" };
      if (line.startsWith("diff --git") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file"))
        return { color: secondary };
      if (line.startsWith("commit ") || line.startsWith("Author:") || line.startsWith("Date:") || line.startsWith("    "))
        return { color: primary, opacity: 0.92 };
      return {};
    }

    function PatchView({ text, truncated }) {
      const lines = useMemo(() => {
        const rows = String(text || "").split("\n");
        return rows.length > 1600 ? rows.slice(0, 1600) : rows;
      }, [text]);
      return h(
        "div",
        { style: { borderTop: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))" } },
        h(
          "pre",
          {
            style: {
              margin: 0,
              padding: "8px 10px",
              maxHeight: 420,
              overflow: "auto",
              background: "color-mix(in srgb, var(--dsw-alias-label-primary, #888) 5%, transparent)",
              fontFamily: "var(--dsw-font-mono, ui-monospace, monospace)",
              fontSize: 11.5,
              lineHeight: "17px",
              whiteSpace: "pre",
            },
          },
          lines.map((line, index) =>
            h("div", { key: index, style: { ...lineStyle(line), minHeight: 17 } }, line === "" ? " " : line),
          ),
        ),
        (truncated || String(text || "").split("\n").length > 1600) &&
          h(
            "div",
            { style: { ...styles.muted, padding: "6px 10px", borderTop: "1px solid var(--dsw-alias-border-l1)" } },
            "Diff dipotong agar tetap ringan.",
          ),
      );
    }

    function ChangeRow({ root, repo, change, mode, keyPrefix }) {
      const [open, setOpen] = useState(false);
      const [state, setState] = useState({ loading: false, text: "", truncated: false, error: null });

      const toggle = async () => {
        if (open) {
          setOpen(false);
          return;
        }
        setOpen(true);
        if (state.text || state.error) return;
        setState((prev) => ({ ...prev, loading: true }));
        try {
          const data = await api("/api/git.diff", {
            root,
            repo: repo.path,
            path: change.path,
            mode,
          });
          setState({ loading: false, text: data.diff || "", truncated: Boolean(data.truncated), error: null });
        } catch (error) {
          setState({ loading: false, text: "", truncated: false, error: error.message });
        }
      };

      const badge = change.untracked
        ? "U"
        : mode === "staged"
          ? `${change.indexStatus} `
          : ` ${change.worktreeStatus}`;

      return h(
        "div",
        null,
        h(
          "button",
          {
            type: "button",
            onClick: toggle,
            style: {
              display: "flex",
              width: "100%",
              alignItems: "center",
              gap: 8,
              padding: "5px 12px",
              border: "none",
              background: open ? "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.04))" : "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
              textAlign: "left",
            },
          },
          h(StatusBadge, { status: change.untracked ? "??" : badge.trim() || "M" }),
          h(
            "span",
            {
              style: {
                ...styles.mono,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
              },
              title: change.origPath ? `${change.origPath} → ${change.path}` : change.path,
            },
            change.path,
            change.origPath ? h("span", { style: { color: "var(--dsw-alias-label-tertiary, #77777d)" } }, `  ← ${change.origPath}`) : null,
          ),
          h("span", { style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary, #77777d)", fontSize: 11 } }, open ? "▾" : "▸"),
        ),
        open &&
          (state.loading
            ? h("div", { style: { ...styles.muted, padding: "8px 12px" } }, "Memuat diff…")
            : state.error
              ? h("div", { style: { ...styles.muted, padding: "8px 12px", color: "var(--dsw-alias-state-error-primary, #e5484d)" } }, state.error)
              : h(PatchView, { text: state.text, truncated: state.truncated })),
      );
    }

    function CommitEntry({ root, repo, commit }) {
      const [open, setOpen] = useState(false);
      const [state, setState] = useState({ loading: false, text: "", truncated: false, error: null });

      const toggle = async () => {
        if (open) {
          setOpen(false);
          return;
        }
        setOpen(true);
        if (state.text || state.error) return;
        setState((prev) => ({ ...prev, loading: true }));
        try {
          const data = await api("/api/git.show", { root, repo: repo.path, hash: commit.hash });
          setState({ loading: false, text: data.patch || "", truncated: Boolean(data.truncated), error: null });
        } catch (error) {
          setState({ loading: false, text: "", truncated: false, error: error.message });
        }
      };

      return h(
        "div",
        null,
        h(
          "button",
          {
            type: "button",
            onClick: toggle,
            style: {
              display: "flex",
              width: "100%",
              alignItems: "baseline",
              gap: 8,
              padding: "7px 12px",
              border: "none",
              background: open ? "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.04))" : "transparent",
              color: "inherit",
              font: "inherit",
              cursor: "pointer",
              textAlign: "left",
            },
          },
          h(
            "span",
            {
              style: {
                ...styles.mono,
                flex: "0 0 auto",
                height: 18,
                padding: "0 5px",
                borderRadius: 4,
                border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.24))",
                color: "var(--dsw-alias-label-secondary, #9b9ba1)",
                fontSize: 10.5,
                lineHeight: "16px",
              },
            },
            commit.shortHash,
          ),
          h(
            "span",
            {
              style: {
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12.5,
              },
              title: commit.subject,
            },
            commit.subject,
          ),
          h(
            "span",
            { style: { marginLeft: "auto", flex: "0 0 auto", color: "var(--dsw-alias-label-tertiary, #77777d)", fontSize: 11 } },
            `${commit.author} · ${ageLabel(commit.date)}`,
          ),
        ),
        open &&
          (state.loading
            ? h("div", { style: { ...styles.muted, padding: "8px 12px" } }, "Memuat commit…")
            : state.error
              ? h("div", { style: { ...styles.muted, padding: "8px 12px", color: "var(--dsw-alias-state-error-primary, #e5484d)" } }, state.error)
              : h(PatchView, { text: state.text, truncated: state.truncated })),
      );
    }

    function RepoCard({ root, repo }) {
      const [tab, setTab] = useState("changes");
      const changes = repo.changes || [];
      const commits = repo.commits || [];
      const branches = repo.branches || [];

      const groups = useMemo(() => {
        const staged = [];
        const unstaged = [];
        const untracked = [];
        const conflicted = [];
        for (const change of changes) {
          if (change.conflicted) {
            conflicted.push(change);
            continue;
          }
          if (change.untracked) {
            untracked.push(change);
            continue;
          }
          if (change.staged) staged.push(change);
          if (change.unstaged) unstaged.push(change);
        }
        return [
          { id: "conflicted", title: "Conflicts", rows: conflicted, mode: "worktree" },
          { id: "staged", title: "Staged", rows: staged, mode: "staged" },
          { id: "unstaged", title: "Changes", rows: unstaged, mode: "worktree" },
          { id: "untracked", title: "Untracked", rows: untracked, mode: "untracked" },
        ].filter((group) => group.rows.length > 0);
      }, [changes]);

      const last = commits[0];

      return h(
        "section",
        { style: styles.card },
        h(
          "div",
          { style: { padding: "12px 14px 8px" } },
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            h(FolderGlyph, null),
            h("span", { style: { fontSize: 14, fontWeight: 650 } }, repo.name),
            repo.relPath !== "." &&
              h(
                "span",
                {
                  style: {
                    ...styles.mono,
                    color: "var(--dsw-alias-label-tertiary, #77777d)",
                    fontSize: 10.5,
                    maxWidth: 320,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  },
                  title: repo.path,
                },
                repo.relPath,
              ),
            repo.error
              ? h(
                  "span",
                  { style: { marginLeft: "auto", color: "var(--dsw-alias-state-error-primary, #e5484d)", fontSize: 11.5 } },
                  repo.error,
                )
              : null,
          ),
          !repo.error &&
            h(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 6,
                  color: "var(--dsw-alias-label-secondary, #9b9ba1)",
                  fontSize: 11.5,
                },
              },
              h(
                "span",
                {
                  style: {
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 7px",
                    borderRadius: 999,
                    border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.24))",
                    color: "inherit",
                  },
                },
                h(BranchGlyph, null),
                repo.branch,
              ),
              repo.ahead > 0 && h("span", { style: { color: "var(--dsw-alias-state-success-primary, #46a758)" } }, `↑${repo.ahead}`),
              repo.behind > 0 && h("span", { style: { color: "#ffb224" } }, `↓${repo.behind}`),
              h(
                "span",
                { style: { display: "inline-flex", alignItems: "center", gap: 5 } },
                h("span", {
                  "aria-hidden": true,
                  style: {
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: changes.length === 0 ? "#46a758" : "#ffb224",
                  },
                }),
                changes.length === 0 ? "bersih" : `${changes.length} perubahan`,
              ),
              last &&
                h(
                  "span",
                  {
                    style: {
                      marginLeft: "auto",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: "var(--dsw-alias-label-tertiary, #77777d)",
                      fontSize: 11,
                    },
                    title: `${last.subject} · ${last.author}`,
                  },
                  `${last.subject} · ${ageLabel(last.date)}`,
                ),
            ),
        ),
        !repo.error &&
          h(
            "div",
            { style: { display: "flex", gap: 2, padding: "0 8px", borderBottom: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.18))" } },
            h(TabButton, { active: tab === "changes", onClick: () => setTab("changes"), count: changes.length }, "Changes"),
            h(TabButton, { active: tab === "commits", onClick: () => setTab("commits"), count: commits.length }, "Commits"),
            branches.length > 0 &&
              h(TabButton, { active: tab === "branches", onClick: () => setTab("branches"), count: branches.length }, "Branches"),
          ),
        !repo.error && tab === "changes"
          ? changes.length === 0
            ? h("div", { style: { ...styles.muted, padding: "14px" } }, "Working tree bersih — tidak ada perubahan.")
            : h(
                "div",
                { style: { padding: "4px 0 8px" } },
                groups.map((group) =>
                  h(
                    "div",
                    { key: group.id },
                    h(
                      "div",
                      {
                        style: {
                          padding: "6px 12px 3px",
                          color: "var(--dsw-alias-label-tertiary, #77777d)",
                          fontSize: 10,
                          fontWeight: 650,
                          letterSpacing: ".06em",
                          textTransform: "uppercase",
                        },
                      },
                      `${group.title} · ${group.rows.length}`,
                    ),
                    group.rows.map((change) =>
                      h(ChangeRow, {
                        key: `${group.id}:${change.path}`,
                        root,
                        repo,
                        change,
                        mode: group.mode,
                      }),
                    ),
                  ),
                ),
              )
          : null,
        !repo.error && tab === "commits"
          ? commits.length === 0
            ? h("div", { style: { ...styles.muted, padding: "14px" } }, "Belum ada commit.")
            : h(
                "div",
                { style: { padding: "4px 0 8px" } },
                commits.map((commit) => h(CommitEntry, { key: commit.hash, root, repo, commit })),
              )
          : null,
        !repo.error && tab === "branches"
          ? branches.length === 0
            ? h("div", { style: { ...styles.muted, padding: "14px" } }, "Belum ada branch lokal.")
            : h(
                "div",
                { style: { padding: "4px 0 8px" } },
                branches.map((branch) =>
                  h(
                    "div",
                    {
                      key: branch.name,
                      style: {
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 12px",
                        background: branch.current ? "var(--dsw-alias-interactive-bg-hover, rgba(255,255,255,.04))" : "transparent",
                      },
                    },
                    h("span", {
                      "aria-hidden": true,
                      style: {
                        width: 6,
                        height: 6,
                        flex: "0 0 auto",
                        borderRadius: "50%",
                        background: branch.current ? "#46a758" : "transparent",
                        boxShadow: branch.current ? "none" : "inset 0 0 0 1px #77777d",
                      },
                    }),
                    h(
                      "span",
                      { style: { ...styles.mono, fontSize: 12, fontWeight: branch.current ? 650 : 500 } },
                      branch.name,
                    ),
                    branch.current &&
                      h(
                        "span",
                        {
                          style: {
                            padding: "0 5px",
                            borderRadius: 4,
                            border: "1px solid var(--dsw-alias-border-l1, rgba(128,128,128,.28))",
                            color: "var(--dsw-alias-label-tertiary, #77777d)",
                            fontSize: 9.5,
                            lineHeight: "16px",
                            letterSpacing: ".04em",
                          },
                        },
                        "HEAD",
                      ),
                    branch.upstream &&
                      h(
                        "span",
                        { style: { color: "var(--dsw-alias-label-tertiary, #77777d)", fontSize: 11 } },
                        `→ ${branch.upstream}`,
                      ),
                    branch.date &&
                      h(
                        "span",
                        { style: { marginLeft: "auto", color: "var(--dsw-alias-label-tertiary, #77777d)", fontSize: 11 } },
                        ageLabel(branch.date),
                      ),
                  ),
                ),
              )
          : null,
      );
    }

    function GitTabBody({ sessionId, useWorkspaces, useSessions, useTabInfo }) {
      // Tab kanan adalah per-Session: root default diturunkan dari Session ini,
      // bukan dari pilihan global. `useWorkspaces`/`useSessions` adalah hook
      // selector yang disuntikkan framework, jadi tidak perlu subscribe manual.
      const tab = useTabInfo().tab;
      const workspaces = useWorkspaces((snapshot) => snapshot.items) || [];
      const sessionCwd = useSessions((sessions) => sessions.byId[sessionId]?.cwd);

      const autoRoot = useMemo(() => {
        const owner = workspaces.find((workspace) =>
          workspace.sessionIds?.includes(sessionId),
        );
        if (owner) return owner.path;
        if (sessionCwd) return sessionCwd;
        return workspaces[0]?.path || "";
      }, [sessionId, sessionCwd, workspaces]);

      const [root, setRoot] = useState("");
      const lastAuto = useRef("");

      useEffect(() => {
        if (!root || root === lastAuto.current) setRoot(autoRoot);
        lastAuto.current = autoRoot;
      }, [autoRoot, root]);

      const [repos, setRepos] = useState([]);
      const [details, setDetails] = useState({});
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      const [tick, setTick] = useState(0);

      const load = useCallback(async () => {
        if (!root) return;
        setLoading(true);
        setError(null);
        try {
          const data = await api("/api/git.repos", { root });
          const list = data.repos || [];
          setRepos(list);
          const rows = await Promise.all(
            list.map(async (item) => {
              try {
                const detail = await api("/api/git.repo", { root, repo: item.path, limit: 15 });
                return [item.path, detail.repo];
              } catch (err) {
                return [item.path, { ...item, error: err.message }];
              }
            }),
          );
          setDetails(Object.fromEntries(rows));
        } catch (err) {
          setError(err.message);
          setRepos([]);
          setDetails({});
        } finally {
          setLoading(false);
        }
      }, [root]);

      useEffect(() => {
        load();
      }, [load, tick]);

      const options = useMemo(() => {
        const rows = workspaces.map((workspace) => ({ path: workspace.path, label: workspace.title || workspace.path }));
        if (root && !rows.some((row) => row.path === root)) rows.unshift({ path: root, label: root });
        return rows;
      }, [workspaces, root]);

      return h(
        "div",
        { style: styles.page },
        h(
          "div",
          { style: styles.toolbar },
          h(
            "select",
            {
              value: root,
              onChange: (event) => setRoot(event.target.value),
              title: root,
              style: styles.select,
            },
            options.map((option) => h("option", { key: option.path, value: option.path }, option.label)),
          ),
          h(
            "button",
            {
              type: "button",
              style: styles.iconButton,
              onClick: () => setTick((value) => value + 1),
              disabled: loading,
              title: loading ? "Memuat…" : "Refresh",
              "aria-label": loading ? "Memuat…" : "Refresh",
            },
            h(
              "svg",
              {
                width: 14,
                height: 14,
                viewBox: "0 0 16 16",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 1.5,
                "aria-hidden": true,
                style: { opacity: loading ? 0.5 : 1 },
              },
              h("path", { d: "M13 8a5 5 0 1 1-1.5-3.6" }),
              h("path", { d: "M13 2.5V5h-2.5" }),
            ),
          ),
        ),
        root && h("div", { style: styles.rootPath, title: root }, root),
        error && h("div", { style: styles.banner }, error),
        !root && h("div", { style: { ...styles.card, padding: 16 } }, h("p", { style: styles.muted }, "Belum ada workspace.")),
        root && loading && repos.length === 0 && h("p", { style: styles.muted }, "Memindai repository…"),
        root &&
          !loading &&
          !error &&
          repos.length === 0 &&
          h(
            "div",
            { style: { ...styles.card, padding: 18, textAlign: "center" } },
            h("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 4 } }, "Tidak ada repository Git"),
            h("p", { style: styles.muted }, "Tidak ditemukan folder dengan .git hingga 3 level di bawah root ini."),
          ),
        repos.map((repo) => h(RepoCard, { key: repo.path, root, repo: details[repo.path] || repo })),
      );
    }

    // Glyph dipakai di tiga tempat dengan ukuran berbeda: ikon guide (prop
    // `size`), chip judul tab, dan ikon panel lama. Warnanya mewarisi currentColor
    // supaya ikut tema terang/gelap.
    function GitIcon(props) {
      const size = Number.isFinite(props?.size) ? props.size : 18;
      const active = Boolean(props?.active);
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 16 16",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.4,
          "aria-hidden": true,
          className: props?.className,
          style: { opacity: active ? 1 : 0.72, flex: "0 0 auto" },
        },
        h("circle", { cx: 4.5, cy: 3.5, r: 1.7 }),
        h("circle", { cx: 4.5, cy: 12.5, r: 1.7 }),
        h("circle", { cx: 11.5, cy: 6.5, r: 1.7 }),
        h("path", { d: "M4.5 5.2v5.6M11.5 8.2v.5c0 2.1-1.7 3.8-3.8 3.8H6.2" }),
      );
    }

    function GitTitle({ useTabInfo }) {
      const tab = useTabInfo().tab;
      return h(React.Fragment, null, h(GitIcon, { size: 14 }), tab.title);
    }

    function apply(ctx) {
      // Panel Git dipindah dari panel utama ke sidebar kanan sebagai salah satu
      // tab, sejajar dengan File Explorer, Terminal, Browser, dan preview.
      // Dua tahap: definisi tipe tab, lalu body + judulnya di key yang sama.
      ctx.effect(
        () =>
          ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: "builtin",
            multiple: false,
            title: () => "Git",
            guide: [
              {
                id: "open",
                order: 30,
                title: () => "Git",
                description: () => "Perubahan, commit, dan branch repository",
                icon: GitIcon,
              },
            ],
          }),
        "dsh-git-tab: type",
      );

      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.right.pane.tab", () =>
            ctx.slots.register(
              { name: "sidebar.right.pane.tab", key: TAB_ID },
              GitTabBody,
            ),
          ),
        "dsh-git-tab: body",
      );

      ctx.effect(
        () =>
          ctx.slots.inject("sidebar.right.pane.tab.title", () =>
            ctx.slots.register(
              { name: "sidebar.right.pane.tab.title", key: TAB_ID },
              GitTitle,
            ),
          ),
        "dsh-git-tab: title",
      );
    }

    module.exports.apply = apply;
    module.exports.inject = ["slots", "sidebarRightTabs"];
    module.exports.TAB_ID = TAB_ID;
    module.exports.TAB_KIND = TAB_KIND;
    return module.exports;
  },
});
