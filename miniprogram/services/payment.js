const { callBusinessFunction } = require("./cloud");

function listCreditProducts() {
  return callBusinessFunction("payment", "listCreditProducts", {});
}

function createCreditOrder(data) {
  return callBusinessFunction("payment", "createCreditOrder", data);
}

function getCreditOrder(data) {
  return callBusinessFunction("payment", "getCreditOrder", data);
}

module.exports = {
  listCreditProducts,
  createCreditOrder,
  getCreditOrder,
};
