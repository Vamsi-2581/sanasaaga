// backend/pb_hooks/users.pb.js
// OAuth registration privacy hook.
//
// Accounts are created through Google OAuth2 only: OAuth2 signup honours the
// users create rule, so the rule has to stay open, but a plain email/password
// signup must not create an account (it would store a PII email that the product
// promises not to keep). OAuth2-created records carry no password, so rejecting
// password-bearing creates leaves the OAuth2 flow untouched.
onRecordCreateRequest((e) => {
    const gamerTag = require(`${__hooks}/gamer_tag.js`);

    if (e.record.collection().name === "users") {
        const isSuperuser = typeof e.hasSuperuserAuth === "function" && e.hasSuperuserAuth();
        if (!isSuperuser && e.record.get("password")) {
            throw new BadRequestError("Tilin luonti onnistuu vain Google-kirjautumisella.");
        }

        // Hide email from public view
        e.record.set("emailVisibility", false);

        // Strip real name provided by OAuth provider
        e.record.set("name", "");

        // If username is empty or matches email prefix, assign a Finnish gamer tag
        if (gamerTag.needsGamerTag(e.record.get("username"), e.record.get("email"))) {
            e.record.set("username", gamerTag.makeGamerTag());
        }
    }

    e.next();
}, "users");
