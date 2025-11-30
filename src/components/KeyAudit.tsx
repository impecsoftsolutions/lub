import React from 'react';

interface KeyAuditProps {
  name: string;
  children: React.ReactNode;
}

export const KeyAudit: React.FC<KeyAuditProps> = ({ name, children }) => {
  console.log(`[KeyAudit:${name}] 🔍 Running audit...`);

  const kids = React.Children.toArray(children);
  const keys = kids.map((k: any) => (k && k.key != null ? String(k.key) : null));

  const dups = new Set<string>();
  const seen = new Set<string>();

  for (const k of keys) {
    if (k != null) {
      if (seen.has(k)) {
        dups.add(k);
      } else {
        seen.add(k);
      }
    }
  }

  const missingCount = keys.filter(k => k == null).length;

  if (missingCount > 0 || dups.size > 0) {
    console.error(
      `[KeyAudit:${name}] ❌ ISSUES FOUND: missing=${missingCount} dups=${[...dups].join(',')}`,
      keys
    );
  } else {
    console.log(`[KeyAudit:${name}] ✅ OK - ${kids.length} children, all have unique keys`);
  }

  return <>{children}</>;
};
