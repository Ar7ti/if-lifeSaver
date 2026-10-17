/** Shared boundary for application shortcuts. Native editing, accessibility and
 * browser shortcuts keep their default behavior inside controls and rich editors. */
export function isEditableKeyboardEvent(event: Pick<KeyboardEvent, 'target' | 'composedPath'>): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some(target => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('input, textarea, select, option, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="searchbox"], [role="combobox"], [role="spinbutton"], [role="slider"], [data-editor]'));
  });
}

/** Safari can report isComposing=false for the Enter that commits an IME
 * composition, while still exposing keyCode=229. That Enter must not send chat. */
export function isChatSubmitKey(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'isComposing' | 'keyCode' | 'defaultPrevented'>): boolean {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !event.defaultPrevented;
}
