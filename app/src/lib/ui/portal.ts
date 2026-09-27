/* Element direkt an <body> hängen, damit Dialoge nicht von Eltern mit Filtern oder Transformationen eingefangen werden */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy() { node.remove(); } };
}
