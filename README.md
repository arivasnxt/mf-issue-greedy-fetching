# mf-issue-greedy-fetching

This repo contains a playground to reproduce an unexpected behavior in the Module Federation plugin. If a remote manifest cannot be **fetched**, the whole application crashes, **even though** we use an error-boundary or **do not use** that module in our codebase (this project does not import that missing remote and the app still crashes).

## How to reproduce

Install the dependencies and start both projects**:**

```sh
cd remote-app
npm install
npm run dev

# In another terminal
cd ../host-app
npm install
npm run dev

# In another terminal
cd ../host-app
npm install
npm run dev
```

Open a web browser and navigate to [http://localhost:8080](http://localhost:8080). You'll see that the app works fine and that the remote component is rendered.
Now, stop the remote app, go to /host-app/rspack.config.ts and uncomment the second remote (foo). This remote won't be found, as it does not exist. If you start the host application again with npm run dev, you'll see that the app crashes, even though the missing remote is not even being imported.
This means that, even though we manage this kind of exception in our code, a missing remote will make our whole application unusable.
