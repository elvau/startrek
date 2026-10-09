/* Zu einer Stelle scrollen und sie kurz aufleuchten lassen (Klasse „flash“) */
export function flashEl(el: HTMLElement | null | undefined, block: ScrollLogicalPosition = "center") {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2000);
}

/* Nach dem Übernehmen aus einer Suche: zum Posten scrollen und ihn kurz aufleuchten lassen */
export function showItem(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-item="${id}"]`);
    if (!el) return;
    el.classList.add("in");
    flashEl(el);
  }, 80);
}
