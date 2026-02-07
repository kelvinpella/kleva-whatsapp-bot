# WhatsApp Image Search Bot

A WhatsApp bot that monitors supplier groups, indexes handbag images, and enables instant search by image.

## Features

- **Group Monitoring**: Automatically monitors WhatsApp supplier groups for new handbag images.
- **Image Indexing**: Indexes and stores handbag images for efficient search.
- **Instant Search**: Allows users to search for similar handbag images instantly by uploading an image.

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/whatsapp-image-search.git
   cd whatsapp-image-search
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your WhatsApp API credentials and database settings.

4. Run the bot:
   ```
   npm start
   ```

## Usage

1. Add the bot to your WhatsApp supplier groups.
2. The bot will automatically index new images posted in the groups.
3. To search for an image, send an image to the bot privately.
4. The bot will respond with similar handbag images from the indexed collection.

## Contributing

Contributions are welcome! Please read the contributing guidelines before making a pull request.

## License

This project is licensed under the MIT License.