
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var len = s.len != null ? s.len : 1;
    var POINTS = [
      'Cloud computing means renting computing power, storage and software over the internet instead of owning it.',
      'There are three service models: IaaS (raw infrastructure), PaaS (a platform to build apps on) and SaaS (ready-to-use software).',
      'Clouds can be public, private, community or hybrid, depending on who shares the infrastructure.',
      'Main benefits are pay-as-you-go pricing, scaling up or down quickly, and less hardware to maintain.',
      'Main risks are depending on a provider, data privacy concerns and needing a reliable internet connection.'
    ];
    var n = [2, 3, 5][len];
    return {
      lengths: ['Key points', 'Short', 'Detailed'].map(function (l, i) {
        var on = i === len;
        return { label: l, on: on, bg: on ? '#FFFFFF' : 'transparent', ink: on ? '#14142B' : '#5E5E73', fw: on ? '600' : '400', shadow: on ? '0 2px 8px rgba(38,28,120,.08)' : 'none', pick: function () { self.setState({ len: i }); } };
      }),
      readTime: ['20 sec read', '30 sec read', '1 min read'][len],
      points: POINTS.slice(0, n).map(function (t, i) { return { text: t, delay: (i * 0.05) + 's' }; })
    };
  }
}
