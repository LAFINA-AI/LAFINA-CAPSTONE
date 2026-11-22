
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var QS = [
      { text: 'Which cloud model gives you virtual machines that you manage yourself?', options: ['IaaS', 'SaaS', 'PaaS', 'On-premise'], answer: 0, explain: 'With IaaS you rent the infrastructure and manage the operating system and apps yourself.' },
      { text: 'Google Docs is an example of…', options: ['IaaS', 'PaaS', 'SaaS', 'A private cloud'], answer: 2, explain: 'SaaS is finished software you use over the internet without installing or maintaining it.' },
      { text: 'What lets one physical server run several operating systems at once?', options: ['Caching', 'Virtualization', 'Load balancing', 'Compression'], answer: 1, explain: 'Virtualization splits one machine into several virtual machines, each with its own OS.' },
      { text: 'A cloud used by only one organization is called a…', options: ['Public cloud', 'Community cloud', 'Hybrid cloud', 'Private cloud'], answer: 3, explain: 'A private cloud is dedicated to a single organization, on-site or hosted.' },
      { text: 'Paying only for the computing you actually use is called…', options: ['Fixed licensing', 'Pay-as-you-go', 'Capital expense', 'Prepaid hosting'], answer: 1, explain: 'Pay-as-you-go pricing bills you for actual usage, one of the main benefits of cloud.' }
    ];
    var NOTES = [
      { id: 'n1', title: 'Lecture 4 – Cloud models', meta: 'IT Elective 3 · 2,140 words' },
      { id: 'n2', title: 'Lecture 5 – Virtualization', meta: 'IT Elective 3 · 1,620 words' },
      { id: 'n3', title: 'Software Eng. reviewer', meta: 'Software Engineering · 3,050 words' }
    ];
    var picked = s.notes || { n1: true, n2: true };
    var count = s.count != null ? s.count : 0;
    var type = s.type || 'mc';
    var phase = s.phase || 'setup';
    var qi = s.qi || 0;
    var choice = s.choice;
    var score = s.score || 0;
    var Q = QS[Math.min(qi, QS.length - 1)];
    var answered = choice != null;
    var correct = answered && choice === Q.answer;
    var KEYS = ['A', 'B', 'C', 'D'];
    function seg(list, cur, key) {
      return list.map(function (l, i) {
        var on = i === cur;
        return { label: l, on: on, bg: on ? '#FFFFFF' : 'transparent', ink: on ? '#14142B' : '#5E5E73', fw: on ? '600' : '400', shadow: on ? '0 2px 8px rgba(38,28,120,.08)' : 'none', pick: function () { var o = {}; o[key] = i; self.setState(o); } };
      });
    }
    return {
      isSetup: phase === 'setup', isQuiz: phase === 'quiz', isResult: phase === 'result',
      notes: NOTES.map(function (n, i) {
        return { title: n.title, meta: n.meta, on: !!picked[n.id], divider: i ? '1px solid #F0EFF6' : '0', toggle: function () { var p = Object.assign({}, picked); p[n.id] = !p[n.id]; self.setState({ notes: p }); } };
      }),
      counts: seg(['5', '10', '20'], count, 'count'),
      types: [['mc', 'Multiple choice'], ['tf', 'True or false'], ['mix', 'Mixed']].map(function (t) {
        var on = t[0] === type;
        return { label: t[1], on: on, border: on ? '1.5px solid #5442E0' : '1.5px solid #E2E1EC', bg: on ? '#EEECFD' : '#FFFFFF', ink: on ? '#3B2CB8' : '#3F3F55', pick: function () { self.setState({ type: t[0] }); } };
      }),
      start: function () { self.setState({ phase: 'quiz', qi: 0, choice: null, score: 0 }); },
      progress: Math.round(((qi + (answered ? 1 : 0)) / QS.length) * 100) + '%',
      qCounter: (qi + 1) + ' of ' + QS.length,
      currentQ: [{ key: qi, text: Q.text, options: Q.options.map(function (o, i) {
        var isAns = i === Q.answer, isPick = i === choice;
        var state = !answered ? 'idle' : isAns ? 'right' : isPick ? 'wrong' : 'dim';
        return {
          key: KEYS[i], text: o, picked: isPick, delay: (i * 0.04) + 's',
          right: state === 'right', wrong: state === 'wrong',
          border: state === 'right' ? '2px solid #1F8A5B' : state === 'wrong' ? '2px solid #D92D20' : '1.5px solid #E6E5EF',
          bg: state === 'right' ? '#E5F5EC' : state === 'wrong' ? '#FEF3F2' : '#FFFFFF',
          keyBg: state === 'right' ? '#1F8A5B' : state === 'wrong' ? '#D92D20' : '#F2F1F9',
          keyInk: state === 'right' || state === 'wrong' ? '#FFFFFF' : '#3F3F55',
          pick: function () { if (answered) return; self.setState({ choice: i, score: score + (i === Q.answer ? 1 : 0) }); }
        };
      }) }],
      answered: answered,
      fbBg: correct ? '#E5F5EC' : '#FEF3F2',
      fbInk: correct ? '#1A7550' : '#B42318',
      fbTitle: correct ? 'Correct!' : 'Not quite. The answer is ' + Q.options[Q.answer] + '.',
      explain: Q.explain,
      nextLabel: qi + 1 < QS.length ? 'Next question' : 'See results',
      next: function () {
        if (qi + 1 < QS.length) self.setState({ qi: qi + 1, choice: null });
        else self.setState({ phase: 'result' });
      },
      score: score + '/' + QS.length,
      scoreOffset: (452.4 * (1 - score / QS.length)).toFixed(1),
      resultTitle: score === QS.length ? 'Perfect score!' : score >= 3 ? 'Nice work' : 'Keep practicing',
      resultText: score === QS.length ? 'You know this lecture well.' : 'You missed ' + (QS.length - score) + '. Turn them into flashcards to review later.',
      retry: function () { self.setState({ phase: 'quiz', qi: 0, choice: null, score: 0 }); }
    };
  }
}
