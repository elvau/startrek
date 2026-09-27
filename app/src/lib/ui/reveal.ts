/* Karten gleiten beim ersten Sichtbarwerden herein */
let io: IntersectionObserver | null = null;

export function reveal(node: HTMLElement) {
  if (typeof IntersectionObserver === "undefined") return;
  io ??= new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io!.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
  node.classList.add("reveal");
  io.observe(node);
  return { destroy() { io?.unobserve(node); } };
}
