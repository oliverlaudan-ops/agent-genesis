/**
 * Control panel — Save / Export / Import / Hard Reset.
 * Lives at the bottom of the right column.
 */
import type { Game } from '@core/Game';

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

    host.appendChild(container);
  }
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
