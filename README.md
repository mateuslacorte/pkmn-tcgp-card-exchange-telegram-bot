# Pokémon TCG Pocket Card Exchange Bot

A Telegram bot that allows users to track missing cards from Pokémon TCG Pocket expansions and facilitate trades with other players.

## Features
- Add missing cards to your collection.
- List missing cards by expansion.
- Check who has the cards you need.
- Request trades with other users.
- Specify whether you want to give a specific card or a random one.
- Track available copies of cards in your collection.
- Support for multiple expansions, configurable via environment variables.

## Setup & Installation

### Requirements
- Node.js (>=18.x)
- Docker & Docker Compose (for containerized deployment)

### Environment Variables
Create a `.env` file with the following variables:
```
BOT_TOKEN=<your_telegram_bot_token>
DATABASE_PATH=tcg_bot.db
```
You can add new expansions to `EXPANSIONS` separated by commas.

### Running Locally
1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the bot:
   ```sh
   npm start
   ```

### Running with Docker
1. Build the Docker image:
   ```sh
   docker build -t pkmn-tcgp-card-exchange-telegram-bot .
   ```
2. Run the container:
   ```sh
   docker run --env-file .env pkmn-tcgp-card-exchange-telegram-bot
   ```

## Commands
- `/start` - Register yourself in the database.
- `/add_expansion <name> <total_cards>` - Add a new expansion.
- `/add_missing <expansion> <card_number>` - Add a missing card to your collection.
- `/missing <expansion>` - List your missing cards from a specific expansion.
- `/trade <username> <expansion> <card_number>` - Request a trade with another user.

## License
MIT License © 2025 Mateus M. Côrtes

