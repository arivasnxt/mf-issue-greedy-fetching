import reactLogo from "./assets/react.svg";
import "./App.css";
import { RemoteModuleWrapper } from "./RemoteModuleWrapper";

function App() {

	return (
		<div className="App">
			<div>
				<a href="https://reactjs.org" target="_blank" rel="noreferrer">
					<img src={reactLogo} className="logo react" alt="React logo" />
				</a>
			</div>
			<h1>Rspack + React + TypeScript</h1>
			<RemoteModuleWrapper />
		</div>
	);
}

export default App;
