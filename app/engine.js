/* Tennis leverage engine — JavaScript port of engine.py (exact same math).
   Hierarchical Markov chain: point -> game -> tiebreak -> set -> match.
   Cross-validated against the Python engine by test_vectors (see repo). */

const memo = new Map();
function mz(key, fn) {
  if (memo.has(key)) return memo.get(key);
  const v = fn();
  memo.set(key, v);
  return v;
}

export function other(p) { return p === "A" ? "B" : "A"; }

export function pGame(a, b, p) {
  return mz(`g${a},${b},${p}`, () => {
    if (a >= 4 && a - b >= 2) return 1;
    if (b >= 4 && b - a >= 2) return 0;
    if (a === b && a >= 3) { const q = 1 - p; return p * p / (p * p + q * q); }
    return p * pGame(a + 1, b, p) + (1 - p) * pGame(a, b + 1, p);
  });
}

export function tbServerAt(fs, n) {
  if (n === 0) return fs;
  return Math.floor((n - 1) / 2) % 2 === 1 ? fs : other(fs);
}

export function pTb(a, b, fs, pA, pB, target = 7) {
  return mz(`t${a},${b},${fs},${pA},${pB},${target}`, () => {
    if (a >= target && a - b >= 2) return 1;
    if (b >= target && b - a >= 2) return 0;
    if (a === b && a >= target - 1) {
      const wa = pA * (1 - pB), wb = (1 - pA) * pB;
      return wa / (wa + wb);
    }
    const srv = tbServerAt(fs, a + b);
    const pt = srv === "A" ? pA : 1 - pB;
    return pt * pTb(a + 1, b, fs, pA, pB, target)
         + (1 - pt) * pTb(a, b + 1, fs, pA, pB, target);
  });
}

export function pSet(ga, gb, server, pA, pB, tbT = 7) {
  return mz(`s${ga},${gb},${server},${pA},${pB},${tbT}`, () => {
    if (ga === 7 || (ga >= 6 && ga - gb >= 2)) return 1;
    if (gb === 7 || (gb >= 6 && gb - ga >= 2)) return 0;
    if (ga === 6 && gb === 6) return pTb(0, 0, server, pA, pB, tbT);
    const gameA = server === "A" ? pGame(0, 0, pA) : 1 - pGame(0, 0, pB);
    const nxt = other(server);
    return gameA * pSet(ga + 1, gb, nxt, pA, pB, tbT)
         + (1 - gameA) * pSet(ga, gb + 1, nxt, pA, pB, tbT);
  });
}

export function pMatchSets(sa, sb, pA, pB, bestOf, tbT = 7) {
  return mz(`m${sa},${sb},${pA},${pB},${bestOf},${tbT}`, () => {
    const need = Math.floor(bestOf / 2) + 1;
    if (sa >= need) return 1;
    if (sb >= need) return 0;
    const s = 0.5 * (pSet(0, 0, "A", pA, pB, tbT) + pSet(0, 0, "B", pA, pB, tbT));
    return s * pMatchSets(sa + 1, sb, pA, pB, bestOf, tbT)
         + (1 - s) * pMatchSets(sa, sb + 1, pA, pB, bestOf, tbT);
  });
}

export function newState(pA, pB, bestOf = 3) {
  return { pA, pB, bestOf, setsA: 0, setsB: 0, gamesA: 0, gamesB: 0,
           ptsA: 0, ptsB: 0, server: "A", tbT: 7 };
}

export function setsToWin(s) { return Math.floor(s.bestOf / 2) + 1; }
export function winner(s) {
  if (s.setsA >= setsToWin(s)) return "A";
  if (s.setsB >= setsToWin(s)) return "B";
  return null;
}
export function inTiebreak(s) { return s.gamesA === 6 && s.gamesB === 6; }

export function tbFirstServer(s) {
  const n = s.ptsA + s.ptsB;
  if (n === 0) return s.server;
  return Math.floor((n - 1) / 2) % 2 === 1 ? s.server : other(s.server);
}

export function pointWinProbA(s) {
  return s.server === "A" ? s.pA : 1 - s.pB;
}

export function winProb(s) {
  const w = winner(s);
  if (w) return w === "A" ? 1 : 0;
  const { pA, pB, tbT } = s;
  let setA;
  if (inTiebreak(s)) {
    setA = pTb(s.ptsA, s.ptsB, tbFirstServer(s), pA, pB, tbT);
  } else {
    const gameA = s.server === "A"
      ? pGame(s.ptsA, s.ptsB, pA)
      : 1 - pGame(s.ptsB, s.ptsA, pB);
    const nxt = other(s.server);
    setA = gameA * pSet(s.gamesA + 1, s.gamesB, nxt, pA, pB, tbT)
         + (1 - gameA) * pSet(s.gamesA, s.gamesB + 1, nxt, pA, pB, tbT);
  }
  return setA * pMatchSets(s.setsA + 1, s.setsB, pA, pB, s.bestOf, tbT)
       + (1 - setA) * pMatchSets(s.setsA, s.setsB + 1, pA, pB, s.bestOf, tbT);
}

function setWon(s, w, nextServer) {
  return { ...s, setsA: s.setsA + (w === "A" ? 1 : 0),
           setsB: s.setsB + (w === "B" ? 1 : 0),
           gamesA: 0, gamesB: 0, ptsA: 0, ptsB: 0, server: nextServer };
}

function gameWon(s, w) {
  const ga = s.gamesA + (w === "A" ? 1 : 0);
  const gb = s.gamesB + (w === "B" ? 1 : 0);
  if ((ga >= 6 || gb >= 6) && Math.abs(ga - gb) >= 2)
    return setWon(s, w, other(s.server));
  return { ...s, gamesA: ga, gamesB: gb, ptsA: 0, ptsB: 0, server: other(s.server) };
}

export function pointWon(s, w) {
  if (winner(s)) throw new Error("match over");
  if (inTiebreak(s)) {
    const pa = s.ptsA + (w === "A" ? 1 : 0);
    const pb = s.ptsB + (w === "B" ? 1 : 0);
    if ((pa >= s.tbT || pb >= s.tbT) && Math.abs(pa - pb) >= 2)
      return setWon(s, w, other(tbFirstServer(s)));
    const nxt = tbServerAt(tbFirstServer(s), pa + pb);
    return { ...s, ptsA: pa, ptsB: pb, server: nxt };
  }
  let pa = s.ptsA + (w === "A" ? 1 : 0);
  let pb = s.ptsB + (w === "B" ? 1 : 0);
  if ((pa >= 4 || pb >= 4) && Math.abs(pa - pb) >= 2) return gameWon(s, w);
  if (pa >= 3 && pb >= 3) { const t = Math.min(pa, pb) - 3; pa -= t; pb -= t; }
  return { ...s, ptsA: pa, ptsB: pb };
}

export function leverage(s) {
  if (winner(s)) return 0;
  return winProb(pointWon(s, "A")) - winProb(pointWon(s, "B"));
}

/* Mean leverage of a fresh match between these players (seeded MC) —
   the baseline for "this point is worth N x an average point". */
export function meanLeverage(pA, pB, bestOf, n = 200) {
  return mz(`ml${pA},${pB},${bestOf},${n}`, () => {
    let seed = 42;
    const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let tot = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      let s = newState(pA, pB, bestOf);
      while (!winner(s)) {
        tot += leverage(s);
        cnt += 1;
        s = pointWon(s, rng() < pointWinProbA(s) ? "A" : "B");
      }
    }
    return tot / cnt;
  });
}
