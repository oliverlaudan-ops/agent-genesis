/**
 * Control panel — Save / Export / Import / Hard Reset.
 * Lives at the bottom of the right column.
 */
import type { Game } from '@core/Game';
import { SettingsModule } from '@modules/settings';

export function renderControls(host: HTMLElement, game: Game, statusEl: HTMLElement): void {
  let container = host.querySelector<HTMLElement>('.controls-panel');
  if (!container) {
    container = document.createElement('div');
    container.className = 'controls-panel';
    const h = document.createElement('h2');
    h.textContent = 'Controls';
    container.appendChild(h);

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;';
    const saveBtn = mkBtn('💾 Save', () => {
      const ok = game.saveNow();
      flash(statusEl, ok ? 'Saved' : 'Save failed', ok ? 'var(--good)' : 'var(--bad)');
    });
    const exportBtn = mkBtn('⬇ Export', () => {
      game.save.exportToFile();
      flash(statusEl, 'Exported', 'var(--good)');
    });
    row1.append(saveBtn, exportBtn);
    container.appendChild(row1);

    const importLabel = document.createElement('label');
    importLabel.className = 'button';
    importLabel.style.cssText =
      'display:inline-block;cursor:pointer;padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg-elev-2);font-size:12px;text-align:center;flex:1;';
    importLabel.textContent = '⬆ Import';
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json';
    importInput.style.display = 'none';
    importInput.addEventListener('change', async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      const ok = await game.save.importFromFile(file);
      flash(statusEl, ok ? 'Imported' : 'Import failed', ok ? 'var(--good)' : 'var(--bad)');
      importInput.value = '';
    });
    importLabel.appendChild(importInput);
    container.appendChild(importLabel);

    const resetBtn = mkBtn('🗑 Hard Reset', () => {
      if (confirm('Wipe all save data? This cannot be undone.')) {
        game.save.hardReset();
        flash(statusEl, 'Wiped', 'var(--warn)');
        location.reload();
      }
    });
    resetBtn.style.color = 'var(--bad)';
    container.appendChild(resetBtn);

    const settings = game.modules.get('settings') as SettingsModule | undefined;
    if (settings && isTouchDevice()) {
      const webglRow = document.createElement('div');
      webglRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px;';

      const label = document.createElement('label');
      label.textContent = 'Enable experimental WebGL';
      label.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = settings.webglEnabled;
      checkbox.addEventListener('change', () => {
        settings.setWebglEnabled(checkbox.checked);
        game.saveNow();
        flash(
          statusEl,
          checkbox.checked ? 'WebGL enabled — reload to apply' : 'WebGL disabled — reload to apply',
          'var(--warn)',
        );
      });

      label.prepend(checkbox);
      webglRow.appendChild(label);
      container.appendChild(webglRow);
    }

    host.appendChild(container);
  }
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    window.matchMedia('(pointer: coarse)').matches
  );
}

function mkBtn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function flash(el: HTMLElement, msg: string, color: string): void {
  el.textContent = msg;
  el.style.color = color;
  setTimeout(() => {
    el.style.color = '';
  }, 1500);
}
