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
| `drizzle/` | Delade migreringar för SQLite och D1 |
| `server/` | Node.js-server, HTTP och SQLite för hemservern |
| `compose.yaml`, `Dockerfile`, `Caddyfile` | Containerbygge, databasvolym och HTTPS |

Bygget använder Node.js 24 och inga installerade npm-beroenden. Det kopierar servermodulerna och paketerar klientens ES-moduler som resurser. `dist/` genereras och behöver inte checkas in.

```sh
npm run build
```

## Hemserver med Docker Compose

Docker Compose startar guildsidan och Caddy, som ordnar HTTPS. SQLite körs inuti appen och sparar data i Docker-volymen `guild_data`. Appens egen port exponeras bara i Docker-nätverket.

1. Installera Docker med Compose och packa upp koden på hemservern.
2. För åtkomst från internet, peka domänens DNS till din publika IP-adress och vidarebefordra TCP-port 80 och 443 från routern till servern. Det behövs för att Caddy ska kunna ordna HTTPS med den här konfigurationen.
3. Kör `cp .env.example .env` och öppna `.env`. Ange domännamnet i `GUILD_DOMAIN`, utan `https://`. Fyll i din e-postadress som `GUILD_OWNER_EMAIL` och skapa `GUILD_IDENTITY_KEY` med exempelvis `openssl rand -hex 32`.
4. Fyll i `RESEND_API_KEY` och `GUILD_FROM_EMAIL` med en avsändaradress på en verifierad domän i Resend. Det används för verifieringsmejl och lösenordsåterställning. Battle.net-nycklarna är valfria.
5. Starta tjänsterna från projektmappen.

```sh
docker compose up -d --build
```

Öppna domänen med HTTPS och registrera ett konto med ägaradressen. När mejlet är verifierat kan du logga in som ägare. Databasen skapas och uppgraderas automatiskt vid start. Installation på hemservern börjar med en tom databas. Konton, speltillfällen och omröstningar från den publicerade sajten följer inte med källkoden.

Kör samma startkommando när du uppdaterat koden. Behåll `.env` och använd samma Compose-projekt vid uppdateringar så att tjänsten hittar sin befintliga volym. Se status med `docker compose ps` och loggar med `docker compose logs app caddy`.

För att säkerhetskopiera databasen, stoppa appen medan hela datavolymen kopieras. Spara även en separat skyddad kopia av `.env` så att du behåller samma identitetsnyckel.

```sh
docker compose stop app
docker compose run --rm --no-deps -T app tar -C /data -czf - . > ../chipstuttarna-db-backup.tar.gz
docker compose start app
```

Om du redan har en HTTPS-proxy kan du även köra appen direkt med Node.js 24. Sätt samma miljövariabler som i tabellen nedan, inklusive `GUILD_PUBLIC_ORIGIN`, och kör `npm run build` följt av `npm start`. Servern lyssnar som standard på `127.0.0.1:3000` och använder `storage/chipstuttarna.sqlite`. De kan ändras med `HOST`, `PORT` och `GUILD_DATABASE_PATH`.

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

### Uppdatera ett befintligt repo med GitHub Desktop

1. Välj **File → Clone repository** i GitHub Desktop och klona `sebastianbarrestal-cmyk/chipstuttarna`. Om du redan har klonat repot, välj det och hämta senaste versionen med **Fetch origin** och vid behov **Pull origin**.
2. Packa upp ZIP-filen separat. Kopiera innehållet i den uppackade mappen `Chipstuttarna` till den klonade mappen. Välj att skriva över filer med samma namn. `compose.yaml` och `README.md` ska ligga direkt i repots rot.
3. Om du tidigare laddade upp själva ZIP-filen eller en extra omslagsmapp med den gamla källkoden, ta bort den gamla ZIP-filen eller omslagsmappen från den klonade mappen.
4. Granska ändringarna i GitHub Desktop. Skriv exempelvis `Lägg till stöd för hemserver`, välj **Commit to main** och sedan **Push origin**.
5. Öppna repot på GitHub och kontrollera att `compose.yaml`, `Dockerfile`, `Caddyfile` och mappen `server` syns.

Detta behåller repo-adressen och den tidigare versionen i Git-historiken. Ladda upp mallfilen `.env.example` och fyll i den riktiga `.env` på hemservern. Förvara databasen och säkerhetskopior utanför repot.

## Logga in med Discord

1. Skapa en applikation i [Discord Developer Portal](https://discord.com/developers/applications).
2. Under **OAuth2 → Redirects**, lägg till guildsidans HTTPS-adress följd av `/api/auth/discord/callback`. För den publicerade sidan är det `https://chipstuttarna.sebastian-barrestal.chatgpt.site/api/auth/discord/callback`.
3. Ange guildsidans HTTPS-adress som `GUILD_PUBLIC_ORIGIN` och konfigurera `DISCORD_CLIENT_ID` och `DISCORD_CLIENT_SECRET` som serverhemligheter. För Docker Compose fyller du i dem i `.env` och kör `docker compose up -d --build` igen.
4. När guildens e-postinloggning och Discord-inställningarna är aktiva visas **Logga in med Discord**. En medlem måste först ha ett verifierat guildkonto. Första Discord-inloggningen matchar den verifierade e-postadressen och kopplar sedan Discord-kontots ID till guildkontot. Behörigheterna hämtas fortfarande från guildkontot.

Discord-flödet behöver bara behörigheterna `identify` och `email`. Ingen bot behövs.

## Discord-notiser och anmälningar

Använd samma Discord-applikation som för inloggningen. Installera dess bot på er Discord-server med **Visa kanal** och **Skicka meddelanden** i den kanal där ni vill ha aviseringarna. Under **General Information** i Discord Developer Portal anger du **Interactions Endpoint URL** som guildsidans HTTPS-adress följd av `/api/discord/interactions`. På den publicerade sidan är adressen:

```text
https://chipstuttarna.sebastian-barrestal.chatgpt.site/api/discord/interactions
```

| Inställning | Användning |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Applikationens bot-token från **Bot**. Förvara den som en serverhemlighet. |
| `DISCORD_PUBLIC_KEY` | Applikationens publika nyckel från **General Information**. Konfigurera den innan du sparar endpointen i Discord. |
| `DISCORD_GUILD_ID` | ID för Discord-servern där anmälningar tillåts. |
| `DISCORD_CHANNEL_ID` | ID för den textkanal där aviseringar ska skickas. |
| `DISCORD_JOB_SECRET` | Valfri serverhemlighet, minst 32 tecken. Krävs bara om en extern schemaläggare använder jobb-URL:en nedan. |

Hemservern kontrollerar kön varje minut när boten är konfigurerad. På en egen Workers-installation gör `triggers.crons` i Wrangler-konfigurationen motsvarande jobb. För ChatGPT-hosting behöver en extern schemaläggare, till exempel ett cron-jobb på hemservern, köra `POST /api/discord/jobs` varje minut med `Authorization: Bearer <DISCORD_JOB_SECRET>`. Nya och inställda speltillfällen skickas också direkt från guildsidan när boten är konfigurerad. Kör bara schemaläggaren för den installation ni faktiskt använder.

Påminnelser skickas upp till 30 minuter före start. Vid ett ändrat startdatum beräknas en påminnelse för den nya tiden. Öppna guildomröstningar aviseras med en länk. Omröstningar för särskilt inbjudna går enbart att se på guildsidan för användare med rätt åtkomst.

I Discord trycker medlemmen **Kommer**, **Kanske** eller **Kan inte**. För de två första väljer medlemmen sin karaktär och, för dungeon eller raid, spelroll. Anmälan sparas i samma lista som på guildsidan. Medlemmar kopplar först sitt konto genom att logga in med Discord på guildsidan.

## Konfigurera integrationerna från Admin

Logga in som admin eller ägare och öppna **Admin → Integrationer**. Under **WoW Forever Armory** sparar du Battle.net-klientens ID och hemlighet. Du kan testa hämtning med för- och efternamnet på en EU-karaktär som visas i Armory.

Under **Discord** sparar du appens ID, hemlighet, bottoken, publika nyckel, server-ID och kanal-ID. Kopiera sidans två adresser till respektive fält i Discord Developer Portal och installera boten på Discord-servern. **Testa bot och kanal** kontrollerar botens identitet och att den kan läsa kanalen. Discord-inloggningen behöver fortfarande guildens verifieringsmejl. Testa OAuth-inloggningen och skicka en riktig avisering från ett nytt speltillfälle när boten är installerad.

Värden som sparas i Admin går före motsvarande miljövariabler. Tomma fält behåller nuvarande värde. Välj **Avstängd** om du vill pausa integrationen även när nycklar redan finns i servermiljön. Armory kan då fortfarande prova den offentliga profilen. På hemservern börjar nya Discord-inställningar användas av påminnelserna inom en minut. `DISCORD_JOB_SECRET` hanteras fortsatt på servern för den externa schemaläggaren.

Inställningarna är krypterade i databasen med en nyckel härledd från `GUILD_IDENTITY_KEY`. Behåll den nyckeln vid uppdateringar och när en databas flyttas eller återställs. Hemligheterna visas aldrig i Admin eller dess ändringshistorik.
