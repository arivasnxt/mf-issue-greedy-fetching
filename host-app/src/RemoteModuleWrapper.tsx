import { lazy, type FC } from "react";
const Animals = lazy(() => import("remote-app/animals"));

export const RemoteModuleWrapper: FC = () => {


    return (
        <section>
            <h2>Remote animals:</h2>
            <Animals />
        </section>
    );
}