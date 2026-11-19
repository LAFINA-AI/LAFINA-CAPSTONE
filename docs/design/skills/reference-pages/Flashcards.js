
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var CARDS = [
      { q: 'What does IaaS stand for?', a: 'Infrastructure as a Service: renting servers, storage and networks instead of buying them.' },
      { q: 'Give one example of a SaaS app.', a: 'Google Docs: software you use in the browser without installing or maintaining it.' },
      { q: 'What is virtualization?', a: 'Running several virtual machines on one physical computer, each with its own operating system.' },
      { q: 'Public cloud vs private cloud?', a: 'A public cloud is shared infrastructure from a provider. A private cloud is used by one organization only.' }
    ];
    var RATE = [
      { k: 'again', label: 'Again', next: '< 1 min', bg: '#FEE4E2', ink: '#B42318' },
      { k: 'hard', label: 'Hard', next: '6 min', bg: '#FFF1DE', ink: '#A15C07' },
      { k: 'good', label: 'Good', next: '1 day', bg: '#DDF3EF', ink: '#0B7468' },
      { k: 'easy', label: 'Easy', next: '4 days', bg: '#EEECFD', ink: '#3B2CB8' }
    ];
    var idx = s.idx || 0;
    var flipped = !!s.flipped;
    var counts = s.counts || { again: 0, hard: 0, good: 0, easy: 0 };
    var finished = idx >= CARDS.length;
    var card = CARDS[Math.min(idx, CARDS.length - 1)];
    return {
      counter: (Math.min(idx + 1, CARDS.length)) + ' / ' + CARDS.length,
      progress: Math.round((idx / CARDS.length) * 100) + '%',
      studying: !finished, finished: finished,
      current: [{ key: idx, q: card.q, a: card.a, aria: flipped ? 'Answer: ' + card.a + '. Tap to flip back' : 'Question: ' + card.q + '. Tap to see the answer' }],
      flipT: flipped ? 'rotateY(180deg)' : 'none',
      flip: function () { self.setState({ flipped: !flipped }); },
      front: !flipped, back: flipped,
      ratings: RATE.map(function (r, i) {
        return { label: r.label, next: r.next, bg: r.bg, ink: r.ink, delay: (i * 0.04) + 's', pick: function () {
          var c = Object.assign({}, counts); c[r.k]++;
          self.setState({ counts: c, idx: idx + 1, flipped: false });
        } };
      }),
      summary: CARDS.length + ' cards reviewed. Next review is scheduled for you.',
      tally: RATE.map(function (r) { return { n: counts[r.k], label: r.label, bg: r.bg, ink: r.ink }; }),
      restart: function () { self.setState({ idx: 0, flipped: false, counts: { again: 0, hard: 0, good: 0, easy: 0 } }); }
    };
  }
}
