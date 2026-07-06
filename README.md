# UL AI Assistant

UL AI Assistant is an intelligent university chatbot designed to provide instant, accurate, and user-friendly answers to questions related to admissions, academics, departments, scholarships, campus facilities, and student services at the University of Layyah.

UL AI Assistant is an AI-powered virtual assistant developed for the University of Layyah. The system is designed to help students, applicants, and visitors quickly access university-related information through natural language conversations.

The assistant can answer questions about admissions, academic programs, departments, fee structures, scholarships, campus facilities, contact information, policies, and other university services. It provides a fast, user-friendly, and intelligent way to access information without manually browsing multiple pages.

## Features

- AI-powered conversational interface
- Answers university-related questions in real time
- Admission and enrollment guidance
- Information about departments and academic programs
- Scholarship and financial aid information
- Campus facilities and student services support
- Contact and administrative information
- Modern and responsive user interface
- Dark and light theme support
- Persistent chat history with rename/delete options
- Easy deployment and customization

## Purpose

The goal of this project is to improve information accessibility for students and visitors by providing a smart assistant capable of answering common questions about the University of Layyah efficiently and accurately.

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **AI Engine:** Google Gemini API
- **Storage:** Browser LocalStorage (chat history)

## Architecture

The application follows a secure client-server architecture:

```
Browser (Frontend)  →  Express Backend  →  Google Gemini API
   No API key            API key stored        AI responses
   stored here            in .env file
```

The frontend never communicates directly with the Gemini API. All requests are routed through a backend server that securely manages the API key and university-specific context, ensuring sensitive credentials are never exposed to the client.

## Project Structure

```
ul-ai-assistant/
├── ul-ai/
│   ├── assets/          # Logo and static assets
│   ├── index.html       # Application structure
│   ├── style.css        # Styling and themes
│   └── server.js        # Backend server (API logic)
├── .env
├── .gitignore
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- A Google Gemini API key ([Get one here](https://aistudio.google.com))

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/naeemsec/ul-ai-assistant.git
   cd ul-ai-assistant
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Configure environment variables
   - Copy `.env.example` to `.env`
   - Add your Gemini API key:
     ```
     GEMINI_API_KEY=your_api_key_here
     GEMINI_MODEL=gemini-2.5-flash
     PORT=3000
     ```

4. Start the server
   ```bash
   npm ul-ai/start
   ```

5. Open your browser at `http://localhost:3000`

## Deployment

This project includes a Node.js backend and requires a hosting platform that supports server-side execution, such as:

- [Render](https://render.com)
- [Railway](https://railway.app)

When deploying, set the `GEMINI_API_KEY` and `GEMINI_MODEL` as environment variables in your hosting platform's dashboard — do not commit them to the repository.

## Security Notes

- API keys are never stored in frontend code.
- `.env` files are excluded from version control via `.gitignore`.
- University-specific context and prompt configuration are kept server-side.

## License

This project is licensed under the ISC License.

## Contributing

Contributions, issues, and feature requests are welcome. Feel free to open an issue or submit a pull request.
