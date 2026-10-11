import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '@/hooks/useT';
import type { MapStatus } from '@/domain/projectMap';

export type MapSizeBy = 'tasks' | 'time';

interface MapDisplayMenuProps {
  /** The spaces to choose between; empty when the account has only one. */
  spaces: Array<{ id: string; label: string }>;
  /** `all`, or the id of a space. */
  scope: string;
  onScope: (scope: string) => void;

  sizeBy: MapSizeBy;
  /** Whether any project on the map has an estimate to be sized by. */
  canSizeByTime: boolean;
  onSize: (size: MapSizeBy) => void;

  /** The statuses there are projects for, with how many. */
  statuses: Array<{ status: MapStatus; label: string; count: number; hint: string }>;
  hiddenStatuses: MapStatus[];
  onStatus: (status: MapStatus) => void;

  /** The folders and top-level projects that can be taken off the map. */
  branches: Array<{ key: string; label: string; total: number }>;
  hiddenBranches: string[];
  onBranch: (key: string) => void;

  legend: boolean;
  onLegend: (shown: boolean) => void;
  /** What the size, the arc and the ring stand for, in one line. */
  help: string;

  /** How many of these are not as the page starts out. */
  changed: number;
  onReset: () => void;
}

/**
 * The map's Display menu: the same surface as on every other page, so the
 * page itself is left with the map and the column beside it.
 *
 * Everything in it is about what this window draws — which projects, at what
 * size — and nothing in it changes Todoist or what is in focus.
 */
export function MapDisplayMenu({
  spaces, scope, onScope, sizeBy, canSizeByTime, onSize,
  statuses, hiddenStatuses, onStatus, branches, hiddenBranches, onBranch,
  legend, onLegend, help, changed, onReset,
}: MapDisplayMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="displaywrap" ref={ref}>
      <button
        className="btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon name="sliders" />
        {t('toolbar.display')}
        {changed > 0 && <span className="displaycount">{changed}</span>}
      </button>

      {open && (
        <div className="popover displaypanel anchor-right mapdisplay" role="dialog" aria-label={t('toolbar.display')}>
          <div className="panelhead">
            <h5>{t('toolbar.display')}</h5>
            <button className="resetbtn" onClick={onReset}>{t('toolbar.resetAll')}</button>
          </div>

          {spaces.length > 1 && (
            <>
              <h5 id="mapdisplay-scope">{t('filter.workspaces')}</h5>
              <div className="segmented small" role="group" aria-labelledby="mapdisplay-scope">
                <button aria-pressed={scope === 'all'} onClick={() => onScope('all')}>
                  <small>{t('filter.any')}</small>
                </button>
                {spaces.map((space) => (
                  <button key={space.id} aria-pressed={scope === space.id} onClick={() => onScope(space.id)}>
                    <small>{space.label}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {canSizeByTime && (
            <>
              <h5 id="mapdisplay-size">{t('map.size')}</h5>
              <div className="segmented small" role="group" aria-labelledby="mapdisplay-size">
                <button aria-pressed={sizeBy === 'tasks'} onClick={() => onSize('tasks')}>
                  <Icon name="tasks" size="sm" /><small>{t('map.sizeTasks')}</small>
                </button>
                <button aria-pressed={sizeBy === 'time'} onClick={() => onSize('time')}>
                  <Icon name="clock" size="sm" /><small>{t('map.sizeTime')}</small>
                </button>
              </div>
            </>
          )}

          {statuses.length > 0 && (
            <>
              <h5 id="mapdisplay-statuses">{t('map.showStatuses')}</h5>
              <div className="chiprow" role="group" aria-labelledby="mapdisplay-statuses">
                {statuses.map(({ status, label, count, hint }) => (
                  <button
                    className="chip" key={status} title={hint}
                    aria-pressed={!hiddenStatuses.includes(status)}
                    onClick={() => onStatus(status)}
                  >
                    <i className={`mapsw st-${status}`} aria-hidden="true" />
                    {label} <small>{count}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          {branches.length > 1 && (
            <>
              <h5 id="mapdisplay-branches">{t('map.branches')}</h5>
              <div className="chiprow scroll" role="group" aria-labelledby="mapdisplay-branches">
                {branches.map((branch) => (
                  <button
                    className="chip" key={branch.key} title={branch.label}
                    aria-pressed={!hiddenBranches.includes(branch.key)}
                    onClick={() => onBranch(branch.key)}
                  >
                    <span className="mapdisplay-name">{branch.label}</span> <small>{branch.total}</small>
                  </button>
                ))}
              </div>
            </>
          )}

          <hr />
          <div className="panelrow">
            <span>{t('map.showLegend')}</span>
            <button
              className="switch"
              role="switch"
              aria-checked={legend}
              aria-label={t('map.showLegend')}
              onClick={() => onLegend(!legend)}
            />
          </div>
          <p className="displayhelp">{help}</p>
        </div>
      )}
    </div>
  );
}
