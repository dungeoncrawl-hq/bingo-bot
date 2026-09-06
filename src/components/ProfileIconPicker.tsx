import { useState } from 'react';
import { PROFILE_ICON_GROUPS } from '../lib/profileIcons';

interface Props {
  currentIcon: string | null;
  onSelect: (url: string | null) => void;
  onClose: () => void;
}

export default function ProfileIconPicker({ currentIcon, onSelect, onClose }: Props) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [subgroupIndex, setSubgroupIndex] = useState(0);
  const group = PROFILE_ICON_GROUPS[groupIndex];
  const subgroup = group.subgroups[subgroupIndex] ?? group.subgroups[0];

  // Subgroup 0 in the new group is very unlikely to be the right one for
  // whatever index was selected in the previous group (e.g. Items has ~28
  // subgroups, Clue Scrolls has 1) -- always reset it on a group switch.
  function selectGroup(index: number) {
    setGroupIndex(index);
    setSubgroupIndex(0);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      {/* Same fixed-header/scrollable-middle/fixed-footer shape as
          TileEditorForm.tsx's modal -- Items' biggest subgroups run to
          dozens of icons, same unbounded-height problem that fix already
          solved once. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col rounded-xl border border-stone-800 bg-stone-950"
      >
        <div className="shrink-0 p-6 pb-0">
          <h2 className="text-lg font-semibold">Choose your icon</h2>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {PROFILE_ICON_GROUPS.map((g, i) => (
              <button
                key={g.group}
                type="button"
                onClick={() => selectGroup(i)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  i === groupIndex ? 'border-amber-500 bg-amber-950/30 text-amber-400' : 'border-stone-700 text-stone-300'
                }`}
              >
                {g.group}
              </button>
            ))}
          </div>
          {group.subgroups.length > 1 && (
            <select
              value={subgroupIndex}
              onChange={(e) => setSubgroupIndex(Number(e.target.value))}
              className="mt-3 w-full rounded-lg border border-stone-700 bg-stone-900 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              {group.subgroups.map((sg, i) => (
                <option key={sg.name} value={i}>
                  {sg.name} ({sg.options.length})
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto p-6 pt-0">
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {subgroup.options.map((opt) => (
              <button
                key={opt.name}
                type="button"
                title={opt.name}
                onClick={() => onSelect(opt.icon)}
                className={`flex aspect-square items-center justify-center rounded-lg border p-1.5 hover:border-amber-500 ${
                  currentIcon === opt.icon ? 'border-amber-500 bg-amber-950/30' : 'border-stone-800 bg-stone-900'
                }`}
              >
                <img src={opt.icon} alt={opt.name} loading="lazy" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </div>
        <div className="shrink-0 border-t border-stone-800 p-6 pt-4">
          <div className="flex items-center justify-between gap-2">
            {currentIcon && (
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400"
              >
                Remove icon
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-auto rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
