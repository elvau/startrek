/* Nach dem Übernehmen aus einer Suche: zum Posten scrollen und ihn kurz aufleuchten lassen */
export function showItem(id: string) {
  setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-item="${id}"]`);
    if (!el) return;
    el.classList.add("in");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("flash");
    void el.offsetWidth;
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 2000);
  }, 80);
}
