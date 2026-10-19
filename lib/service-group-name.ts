/**
 * Names a walk-up after what its bodies of water already share.
 *
 * "Clubhouse Pool" and "Clubhouse (SW) Spa" become "Clubhouse"; "Back Pool (East)" and "Back Spa"
 * become "Back". A name the operator already uses is the difference between a field they trust and
 * one they clear out, and these groups are being written for them by a backfill rather than typed.
 *
 * Falls back to "Main" when the members share no leading words -- a plain "Pool" and "Spa" pair,
 * which is most properties -- or to "Walk-up N" when one property has several such groups and
 * "Main" would be ambiguous.
 */
export function serviceGroupName(memberNames: string[], index: number, totalGroupsAtProperty: number): string {
  const wordLists = memberNames.map((name) => name.trim().split(/\s+/)).filter((words) => words.length > 0);
  if (wordLists.length === 0) return "Main";

  const shared: string[] = [];
  for (let i = 0; i < wordLists[0].length; i++) {
    const word = wordLists[0][i];
    if (wordLists.every((words) => words[i]?.toLowerCase() === word.toLowerCase())) shared.push(word);
    else break;
  }

  // A shared prefix that IS the whole of some member's name is not a name for the group -- "Pool"
  // and "Pool 2" share "Pool", and calling the walk-up "Pool" says nothing about which one.
  const isWholeName = wordLists.some((words) => words.length === shared.length);
  // Trailing punctuation from a half-matched parenthetical: "Gym (NE) Pool" / "Gym (SW) Spa".
  const label = isWholeName ? "" : shared.join(" ").replace(/[([{]+$/, "").trim();

  if (label) return label;
  return totalGroupsAtProperty > 1 ? `Walk-up ${index + 1}` : "Main";
}
