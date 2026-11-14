# Chipstuttarna

Guildsida för WoW Forever med bokningar för raids, dungeons och PvP, karaktärsstatistik, Armory och raidloot. Officerare följer upp närvaro och hanterar omröstningar. Admin hanterar konton, registrering och regler för officiella tillfällen.

## Källkod

| Sökväg | Ansvar |
| --- | --- |
| `ui/app.js` | Navigation, initiering och koppling mellan vyer och API |
| `ui/model.js`, `ui/components.js` | Klienttillstånd, API-anrop och gemensamma komponenter |
| `ui/events.js`, `ui/characters.js`, `ui/polls.js` | Speltillfällen, karaktärer och omröstningar |
| `ui/officers.js`, `ui/admin.js`, `ui/auth.js` | Officersvy, administration och inloggning |
| `worker/index.js` | HTTP-ingång och routing |
| `worker/events.js`, `worker/characters.js`, `worker/statistics.js`, `worker/polls.js` | Serverlogik per funktion |
| `worker/accounts.js`, `worker/identity.js`, `worker/registration.js`, `worker/admin.js` | Konton, identitet, registreringsregler och administration |
| `worker/armory.js`, `worker/raid-drops.js` | Anslutningar för Armory och droppdata |
| `drizzle/` | D1-migreringar i nummerordning |

Bygget använder Node.js 24 och inga installerade npm-beroenden. Det kopierar servermodulerna och paketerar klientens ES-moduler som resurser. `dist/` genereras och behöver inte checkas in.

```sh
npm run build
```

## Cloudflare Workers och D1

1. Kopiera `wrangler.example.jsonc` till `wrangler.local.jsonc`.
2. Skapa en D1-databas med `npx wrangler d1 create chipstuttarna` och fyll i dess ID i konfigurationen.
3. Kopiera `.dev.vars.example` till `.dev.vars` och fyll i värden för din miljö.
4. Bygg och applicera migreringarna innan du startar sidan.

```sh
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.local.jsonc
npx wrangler dev --config wrangler.local.jsonc
```

På en separat Workers-installation används guildens egen inloggning med e-post. ChatGPT-inloggningen som visas utan mejlkonfiguration kräver ChatGPT Sites och dess hanterade inloggning. Använd en HTTPS-adress i `GUILD_PUBLIC_ORIGIN` för att testa länkar i riktiga mejl. För produktionsdrift, lägg hemligheterna som Workers-secrets, applicera migreringarna med `--remote` och publicera med `npx wrangler deploy --config wrangler.local.jsonc`.

| Inställning | Användning |
| --- | --- |
| `GUILD_IDENTITY_KEY` | Lång slumpmässig serverhemlighet, exempelvis från `openssl rand -hex 32`. Behåll samma värde vid uppdateringar. |
| `GUILD_OWNER_EMAIL` | E-postadressen som ger ägarrollen vid första registrering. |
| `GUILD_PUBLIC_ORIGIN` | Guildens publika HTTPS-adress för verifierings- och återställningslänkar. |
| `RESEND_API_KEY`, `GUILD_FROM_EMAIL` | Registrering och lösenordsåterställning. Avsändaren behöver höra till en domän som verifierats i Resend. |
| `BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET` | Battle.net API för synk av utrustning. |

Den exporterade källkoden innehåller varken den publicerade sidans databas eller driftkonfiguration. Ny installation börjar med tom databas. En befintlig databas måste själv migreras om den ska flyttas. Raidens observerade droppdata kommer från [Everloot](https://everloot.app/docs/api/rollups-drops) och föremålsdata från [AHledger](https://ahledger.com/data). Utdelad guildloot kräver fortfarande en separat logg.

## GitHub

Packa upp källkoden och ladda upp innehållet som roten i ett nytt repo. Fyll i lokala konfigurationsfiler efter uppladdningen. Håll API-nycklar, hemligheter och databaser utanför repot.
