#!/usr/bin/env python3
"""Word recombination: random word strings from recent chat messages, paired up
as seeds for new questions and ideas.

The user found that a stray phrase, said after several research passes, led to a
better answer than the passes themselves. This makes that happen on purpose.
Seeds are sampled evenly per message, not per word, so one long message (a
context summary, a pasted log) doesn't drown out the short ones. Each seed pairs
fragments from two different messages.

What to do with the seeds is in RESEARCH.md §5 (Recombination).

Usage:
  tools/recombine.py <transcript.jsonl | notes.txt> [--last 20] [--seeds 30] [--seed N]

A .jsonl file is read as a Claude Code transcript (~/.claude/projects/<dir>/<session>.jsonl);
only user and assistant text counts, not tool calls or tool output. Any other file
is split into messages on blank lines.
"""
import argparse
import json
import random
import re

WORD = re.compile(r"[A-Za-zÀ-ÿ'’\-]+")
NOISE = re.compile(r"https?://\S+|`[^`]*`|\[[^\]]*\]\([^)]*\)")


def messages_from_jsonl(path):
    out = []
    for line in open(path, encoding='utf-8'):
        try:
            d = json.loads(line)
        except json.JSONDecodeError:
            continue
        if d.get('type') not in ('user', 'assistant'):
            continue
        c = d.get('message', {}).get('content')
        if isinstance(c, str):
            texts = [c]
        elif isinstance(c, list):
            texts = [b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text']
        else:
            texts = []
        t = '\n'.join(texts).strip()
        # Skip system wrappers and one-liners.
        if len(t) >= 40 and not t.startswith('<'):
            out.append(t)
    return out


def messages_from_text(path):
    return [m.strip() for m in open(path, encoding='utf-8').read().split('\n\n') if len(m.strip()) >= 40]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('source')
    ap.add_argument('--last', type=int, default=20, help='how many recent messages to draw from')
    ap.add_argument('--seeds', type=int, default=30)
    ap.add_argument('--seed', type=int, default=None, help='random seed, for a repeatable list')
    a = ap.parse_args()
    msgs = messages_from_jsonl(a.source) if a.source.endswith('.jsonl') else messages_from_text(a.source)
    msgs = msgs[-a.last:]
    rng = random.Random(a.seed)
    frags = []
    for i, t in enumerate(msgs):
        w = WORD.findall(NOISE.sub('', t))
        if len(w) < 6:
            continue
        for _ in range(3 if len(w) > 200 else 2):
            n = rng.randint(3, 5)
            s = rng.randrange(0, len(w) - n)
            frags.append((i, ' '.join(w[s:s + n])))
    if len({i for i, _ in frags}) < 2:
        raise SystemExit('need at least two messages with text')
    for k in range(a.seeds):
        x, y = rng.sample(frags, 2)
        while x[0] == y[0]:
            x, y = rng.sample(frags, 2)
        print(f'{k + 1:2}. "{x[1]}" + "{y[1]}"')


if __name__ == '__main__':
    main()
