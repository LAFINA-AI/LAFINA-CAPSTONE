
class Component extends DCLogic {
  componentWillUnmount() { (this._ts || []).forEach(clearTimeout); }
  renderVals() {
    var self = this;
    var s = this.state || {};
    var FORMATS = {
      slides: { label: 'Slides', ext: '.pptx', tile: '#FFEDD5', ink: '#C2410C', d: 'M3 4h18v12H3ZM12 16v4M8 20h8', badge: 'PPT', verb: 'Designing slides', file: 'Cloud Computing Report.pptx', meta: '10 slides · just now', lengths: ['5 slides', '10 slides', '15 slides'], lengthLabel: 'Slides' },
      doc: { label: 'Document', ext: '.docx', tile: '#DBEAFE', ink: '#1D4ED8', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M9 13h6M9 17h4', badge: 'DOC', verb: 'Formatting your document', file: 'Cloud Computing Report.docx', meta: '4 pages · just now', lengths: ['1–2 pages', '3–5 pages', '6+ pages'], lengthLabel: 'Length' },
      pdf: { label: 'PDF', ext: '.pdf', tile: '#FEE4E2', ink: '#B42318', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5M8 13h2.5a1.5 1.5 0 0 1 0 3H8v-3ZM8 16v2', badge: 'PDF', verb: 'Building your PDF', file: 'Cloud Computing Report.pdf', meta: '4 pages · just now', lengths: ['1–2 pages', '3–5 pages', '6+ pages'], lengthLabel: 'Length' }
    };
    var fmtKey = s.fmt || 'slides';
    var F = FORMATS[fmtKey];
    var prompt = s.prompt != null ? s.prompt : '';
    var len = s.len != null ? s.len : 1;
    var src = s.src || { notes: true };
    var phase = s.phase || 'form';
    var step = s.step || 0;
    var can = prompt.trim().length > 0 || !!src.notes || !!src.upload;
    var STEPS = ['Reading your sources', 'Outlining', 'Writing content', F.verb];
    var SOURCES = [
      { id: 'notes', label: 'My notes', d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5ZM14 3v5h5' },
      { id: 'upload', label: 'Upload a file', d: 'M12 15V3M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5' },
      { id: 'handbook', label: 'USTP Handbook', d: 'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a2 2 0 0 0-2 2 2 2 0 0 0-2-2H4ZM12 5v16' }
    ];
    var isPageFmt = fmtKey !== 'slides';
    return {
      isForm: phase === 'form', isWorking: phase === 'working', isDone: phase === 'done',
      back: function () { self.setState({ phase: 'form' }); },
      formats: ['slides', 'doc', 'pdf'].map(function (k) {
        var f = FORMATS[k], on = k === fmtKey;
        return {
          label: f.label, ext: f.ext, tile: f.tile, ink: f.ink, d: f.d, on: on,
          border: on ? '2px solid #5442E0' : '1px solid #ECEBF4',
          shadow: on ? '0 8px 20px rgba(84,66,224,.16)' : 'none',
          pick: function () { self.setState({ fmt: k }); }
        };
      }),
      placeholder: fmtKey === 'slides' ? 'e.g. 10-slide group report on cloud computing for IT Elective 3' : 'e.g. A reviewer for my Software Engineering midterm',
      prompt: prompt,
      promptCount: prompt.length ? prompt.length + ' / 500' : 'Tip: mention the subject and who it’s for',
      onPrompt: function (e) { self.setState({ prompt: e.target.value.slice(0, 500) }); },
      sources: SOURCES.map(function (x) {
        var on = !!src[x.id];
        return {
          label: x.label, d: x.d, on: on,
          border: on ? '1.5px solid #5442E0' : '1.5px solid #E2E1EC',
          bg: on ? '#EEECFD' : '#FFFFFF',
          ink: on ? '#3B2CB8' : '#3F3F55',
          toggle: function () { var n = Object.assign({}, src); n[x.id] = !on; self.setState({ src: n }); }
        };
      }),
      lengthLabel: F.lengthLabel,
      lengths: F.lengths.map(function (l, i) {
        var on = i === len;
        return { label: l, on: on, bg: on ? '#FFFFFF' : 'transparent', ink: on ? '#14142B' : '#5E5E73', fw: on ? '600' : '400', shadow: on ? '0 2px 8px rgba(38,28,120,.08)' : 'none', pick: function () { self.setState({ len: i }); } };
      }),
      cant: !can,
      ctaBg: can ? '#5442E0' : '#A79DF2',
      ctaShadow: can ? '0 10px 24px rgba(84,66,224,.30)' : 'none',
      ctaLabel: 'Generate ' + (fmtKey === 'slides' ? 'slides' : fmtKey === 'doc' ? 'document' : 'PDF'),
      generate: function () {
        if (!can) return;
        (self._ts || []).forEach(clearTimeout);
        self._ts = [];
        self.setState({ phase: 'working', step: 0 });
        [1, 2, 3, 4].forEach(function (n) {
          self._ts.push(setTimeout(function () { self.setState({ step: n }); }, n * 900));
        });
        self._ts.push(setTimeout(function () { self.setState({ phase: 'done' }); }, 4300));
      },
      workingTitle: step < 3 ? 'Working on it…' : 'Almost there…',
      steps: STEPS.map(function (l, i) {
        return { label: l, done: i < step, active: i === step, waiting: i > step, ink: i <= step ? '#14142B' : '#8A8AA0', fw: i === step ? '600' : '400' };
      }),
      doneTitle: 'Your ' + (fmtKey === 'slides' ? 'slides are' : fmtKey === 'doc' ? 'document is' : 'PDF is') + ' ready',
      isSlides: !isPageFmt, isPage: isPageFmt,
      accentTile: F.tile, accentInk: F.ink, badge: F.badge,
      fileName: F.file, fileMeta: F.meta,
      again: function () { self.setState({ phase: 'form', step: 0 }); }
    };
  }
}
