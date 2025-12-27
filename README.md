# nilch

A not-for-profit-style search engine with no ads, no AI, and all DuckDuckGo bangs. See [nilch.org](https://nilch.org) and try it out!

nilch uses the Brave search API internally for results.

## Code structure

You can find all frontend sources in `frontend/` and backend sources in `backend/`. The backend is a single Flask server containing the API, and the frontend is raw HTML/CSS/JS which calls the backend API with JS `fetch()`. Because of this separation, both can be run on completely different servers, or you could even run your own frontend locally and use the shared backend. It's also cheaper to run with my setup :)

You may need to tinker a little bit to set up your own instance, however I intend to very soon improve it to be easier.

## License

This project is under the Mozilla Public License 2.0. See the `LICENSE` file for more information.
