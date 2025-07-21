import { RetryPlugin } from "@module-federation/retry-plugin";

const retryPlugin = () =>
	RetryPlugin({
		fetch: {
			fallback: (url?: string | URL | Request) => {
				console.error("Failed to load module:", url);
				return "http://localhost:8082/fallback-mf-manifest.json";
			},
			options: {},
		},
		script: {
			cb: (resolve, error) => {
				console.log("44444", { error });
				resolve("http://localhost:8082/fallback-mf-manifest.json");
			},
		},
	});
export default retryPlugin;
