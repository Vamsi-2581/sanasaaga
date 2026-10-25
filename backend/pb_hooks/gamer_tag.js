// backend/pb_hooks/gamer_tag.js
// Anonymous Finnish animal gamer tags, shared by the signup hook and the
// bootstrap backfill.
const ANIMALS = [
    "Kettu", "Ilves", "Karhu", "Susi", "Ahma", "Norppa",
    "Hirvi", "Metso", "Kuukkeli", "Siili", "Saukko", "Pöllö"
];

function makeGamerTag() {
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return animal + num;
}

// True when the user has no usable gamer tag: empty, or just the OAuth email prefix.
function needsGamerTag(username, email) {
    if (!username) return true;
    if (!email) return false;
    return username === email.split("@")[0];
}

module.exports = {
    ANIMALS: ANIMALS,
    makeGamerTag: makeGamerTag,
    needsGamerTag: needsGamerTag
};
