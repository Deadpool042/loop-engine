export function estimateTokens(content: string): number {
  if (content.length === 0) {
    return 0;
  }

  // Approximation déterministe et volontairement conservatrice :
  // 1 token estimé pour 4 caractères, arrondi au supérieur.
  return Math.ceil(content.length / 4);
}
