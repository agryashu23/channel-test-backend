function generateDateTimePlus10Minutes() {
  const now = new Date();
  const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);

  return tenMinutesLater;
}

module.exports = {
  generateDateTimePlus10Minutes,
};
