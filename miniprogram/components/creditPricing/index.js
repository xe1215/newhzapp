const { CREDIT_PACKAGES } = require('../../services/credits');

const packages = CREDIT_PACKAGES.map(item => ({
  ...item,
  priceLabel: `¥${item.amountCents / 100}`,
}));

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false,
      observer(visible) {
        if (visible) this.setData({ selectedCredits: 0, selectedPrice: '' });
      },
    },
    balance: { type: Number, value: 0 },
  },
  data: {
    packages,
    selectedCredits: 0,
    selectedPrice: '',
  },
  methods: {
    noop() {},
    close() {
      this.triggerEvent('close');
    },
    selectPackage(event) {
      const credits = Number(event.currentTarget.dataset.credits);
      const selected = packages.find(item => item.credits === credits);
      if (!selected) return;
      this.setData({ selectedCredits: credits, selectedPrice: selected.priceLabel });
    },
    purchase() {
      const selected = packages.find(item => item.credits === this.data.selectedCredits);
      if (selected) this.triggerEvent('purchase', selected);
    },
  },
});
