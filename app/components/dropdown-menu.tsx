"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

type DropdownItem = {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
};

type DropdownMenuProps = {
  label: string;
  items: DropdownItem[];
  className?: string;
};

export function DropdownMenu({ label, items, className }: DropdownMenuProps) {
  const visibleItems = items.filter((item) => !item.disabled);
  if (!visibleItems.length) return null;

  return (
    <Menu.Root>
      <Menu.Trigger
        className={cn(
          "flex items-center gap-1 border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[var(--text-secondary)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)]",
          className,
        )}
      >
        {label}
        <ChevronDown className="size-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} className="z-50">
          <Menu.Popup className="min-w-40 border border-[var(--border)] bg-[var(--surface)] py-1 text-[var(--text-secondary)] shadow-lg outline-none">
            {visibleItems.map((item) => (
              <Menu.Item
                key={item.label}
                disabled={item.loading}
                onClick={item.onClick}
                className="flex cursor-default items-center px-3 py-2 text-sm outline-none data-[highlighted]:bg-[var(--muted)] data-[highlighted]:text-[var(--accent)] data-[disabled]:opacity-50"
              >
                {item.loading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-3 animate-spin rounded-full border border-[var(--border)] border-t-[var(--accent)]" />
                    {item.label}
                  </span>
                ) : (
                  item.label
                )}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
