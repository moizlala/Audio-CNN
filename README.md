# Audio-CNN

This project is an audio classifier built with Next.js. It contains both frontend and backend logic in a single codebase.

## Project Structure

- `src/` - Contains source code for both frontend (React components, pages) and backend (API routes).
- `next.config.js` - Next.js configuration.
- `public/` - Static assets.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

## Installation

```bash
npm install
# or
yarn install
```

## Running the Application

### Development Mode

Runs both frontend and backend (API routes) in development mode:

```bash
npm run dev
# or
yarn dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api/...

### Production Build

Build and start the application in production mode:

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## Environment Variables

Environment variables are loaded from `src/env.js`. You can skip validation by setting `SKIP_ENV_VALIDATION=1` when running build or dev.

## Model Configuration

The model configuration (architecture, hyperparameters, etc.) is defined in the backend code, typically under `src/` (for example, in `src/model/` or `src/api/`). You can adjust parameters such as the number of layers, learning rate, and epochs directly in the model definition files.

If you wish to modify the model, locate the relevant file (e.g., `src/model/audioCnnModel.js`) and update the configuration as needed. Example parameters you might find or add:

```js
const config = {
  inputShape: [128, 128, 1],
  numClasses: 10,
  learningRate: 0.001,
  epochs: 20,
  batchSize: 32,
  // ...other hyperparameters...
};
```

## Dataset Training

To train the model, you need a labeled audio dataset. The dataset should be organized into folders by class, or provided with a CSV/JSON label file. Training is typically handled by a backend script or API endpoint.

**Steps to train:**

1. Place your dataset in a directory (e.g., `data/train/`).
2. Update the dataset path in the training script or configuration.
3. Run the training command or trigger the training API endpoint.

Example (if using a script):

```bash
node src/model/train.js --data-dir ./data/train
```

Or, if training is triggered via an API:

- Send a POST request to `/api/train` with dataset details.

After training, the model weights are saved (e.g., in `src/model/saved/`). You can then use the trained model for inference via the API or frontend.

---

For more details, see the source files in the `src/` directory.
