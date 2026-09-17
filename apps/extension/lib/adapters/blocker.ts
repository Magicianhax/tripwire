/**
 * Installs a capture-phase click/keydown listener on a tier-1 anchor that prevents it from
 * ever reaching the venue's own handlers while a TRIPWIRE verdict is active and unoverridden.
 * This is the ONLY interception Tripwire performs — no wallet access, no signing, no tx
 * interception; it's UI friction on the button itself.
 *
 * `release()` removes both listeners (called on unlock or target change).
 */
export function installBlocker(anchor: HTMLElement): { release(): void } {
  function block(event: Event): void {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      block(event);
    }
  }

  anchor.addEventListener("click", block, true);
  anchor.addEventListener("keydown", onKeydown, true);

  return {
    release() {
      anchor.removeEventListener("click", block, true);
      anchor.removeEventListener("keydown", onKeydown, true);
    },
  };
}
