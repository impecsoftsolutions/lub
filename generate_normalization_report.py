import os
import sys
from datetime import datetime

# ---- CONFIGURATION ----

# Keywords to search for in files
KEYWORDS = [
    "normalize-member",          # Edge function name / invoke
    "normalizeFormData",         # Frontend normalization helper
    "NormalizationPreviewModal", # Preview UI
    "normalization_rules",       # DB rules table
    "normalize(",                # Generic function calls
    "normalization",             # Generic mentions
]

# File extensions that are interesting for us
SCAN_EXTENSIONS = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs",
    ".cjs", ".json", ".sql", ".md",
    ".py", ".yml", ".yaml"
}

# Folders to skip while walking
SKIP_DIRS = {
    ".git", "node_modules", "dist", "build", ".next",
    ".turbo", ".vercel", ".cache", ".output"
}

# How many lines of context around each match
CONTEXT_LINES = 3

# Whether to include full file contents if the filename looks normalization-related
INCLUDE_FULL_FILE_IF_NAME_MATCHES = True

# Substrings in filename that trigger full file dump
FULL_FILE_NAME_TRIGGERS = [
    "normalize",
    "Normalization",
    "normalize-member",
    "member_registration",
    "member-registration",
    "edge",
    "functions",
]


# ---- UTILITY FUNCTIONS ----

def should_scan_file(filename: str) -> bool:
    _, ext = os.path.splitext(filename)
    return ext in SCAN_EXTENSIONS


def read_file_lines(filepath: str):
    """Read file safely and return list of lines or [] if unreadable."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.readlines()
    except UnicodeDecodeError:
        # Try a fallback encoding
        try:
            with open(filepath, "r", encoding="latin-1") as f:
                return f.readlines()
        except Exception:
            return []
    except Exception:
        return []


def find_keyword_matches(lines, keywords):
    """Return list of matches as dicts {lineno, keyword, line, context}."""
    matches = []
    for idx, line in enumerate(lines):
        for kw in keywords:
            if kw in line:
                start = max(0, idx - CONTEXT_LINES)
                end = min(len(lines), idx + CONTEXT_LINES + 1)
                context_block = "".join(lines[start:end])
                matches.append({
                    "lineno": idx + 1,
                    "keyword": kw,
                    "line": line.rstrip("\n"),
                    "context": context_block
                })
                break
    return matches


def looks_like_normalization_file(filename: str) -> bool:
    lower = filename.lower()
    for trigger in FULL_FILE_NAME_TRIGGERS:
        if trigger.lower() in lower:
            return True
    return False


def main():
    # Determine root directory
    if len(sys.argv) > 1:
        root_dir = sys.argv[1]
    else:
        root_dir = os.getcwd()

    # Determine output file path
    if len(sys.argv) > 2:
        output_path = sys.argv[2]
    else:
        output_path = os.path.join(root_dir, "normalization_report.txt")

    root_dir = os.path.abspath(root_dir)

    print(f"📁 Project root: {root_dir}")
    print(f"📝 Output file: {output_path}")
    print("🔍 Scanning...")

    # Data structures to build report
    edge_function_files = []   # supabase/functions/* files
    all_matches = {}           # path -> [matches]
    full_files = {}            # path -> full_text (optional)

    # Walk the directory tree
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Skip big / irrelevant folders
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            if not should_scan_file(filename):
                continue

            full_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(full_path, root_dir)

            # Detect edge function files (supabase/functions/...)
            # Adjust if your structure is slightly different
            norm_dirpath = dirpath.replace("\\", "/")
            if "supabase/functions" in norm_dirpath:
                edge_function_files.append(rel_path)

            lines = read_file_lines(full_path)
            if not lines:
                continue

            matches = find_keyword_matches(lines, KEYWORDS)
            if matches:
                all_matches[rel_path] = matches

                # Decide whether to include full file source
                if (INCLUDE_FULL_FILE_IF_NAME_MATCHES
                        and looks_like_normalization_file(filename)):
                    full_files[rel_path] = "".join(lines)

    # ---- WRITE REPORT ----
    with open(output_path, "w", encoding="utf-8") as out:
        # HEADER
        out.write("LUB Web Portal – Normalization Analysis Report\n")
        out.write("=" * 70 + "\n\n")
        out.write(f"Generated at: {datetime.now().isoformat()}\n")
        out.write(f"Project root: {root_dir}\n\n")

        out.write("This report is auto-generated to help analyze how data normalization\n")
        out.write("is implemented across the project. It includes:\n")
        out.write("1) List of Supabase Edge Function files\n")
        out.write("2) All matches of normalization-related keywords, with context\n")
        out.write("3) (Optional) Full source of files whose names indicate normalization logic\n")
        out.write("\n")
        out.write("Keywords searched:\n")
        for kw in KEYWORDS:
            out.write(f"  - {kw}\n")
        out.write("\n\n")

        # SECTION 1: Edge Functions
        out.write("# 1. Supabase Edge Function files (detected by 'supabase/functions')\n")
        out.write("# -----------------------------------------------------------------\n\n")
        if edge_function_files:
            for path in sorted(set(edge_function_files)):
                out.write(f"- {path}\n")
        else:
            out.write("No Edge Function files detected under 'supabase/functions'.\n")
        out.write("\n\n")

        # SECTION 2: Keyword matches
        out.write("# 2. Normalization-related keyword matches (with context)\n")
        out.write("# ------------------------------------------------------\n\n")

        if not all_matches:
            out.write("No matches found for the specified keywords.\n\n")
        else:
            for path in sorted(all_matches.keys()):
                out.write(f"## File: {path}\n")
                out.write("-" * (6 + len(path)) + "\n\n")
                for m in all_matches[path]:
                    out.write(f"[Line {m['lineno']}] Keyword: {m['keyword']}\n")
                    out.write("Context:\n")
                    # Indent context for readability
                    for ctx_line in m["context"].splitlines():
                        out.write(f"    {ctx_line}\n")
                    out.write("\n")
                out.write("\n")

        # SECTION 3: Full file sources (for key normalization files)
        out.write("# 3. Full source of suspected normalization-related files\n")
        out.write("# ------------------------------------------------------\n\n")
        if not full_files:
            out.write("No files selected for full-source dump based on filename.\n")
        else:
            for path in sorted(full_files.keys()):
                out.write(f"## Full file: {path}\n")
                out.write("-" * (11 + len(path)) + "\n")
                out.write("```text\n")
                out.write(full_files[path])
                out.write("\n```\n\n")

    print("✅ Done. Report written to:", output_path)


if __name__ == "__main__":
    main()
