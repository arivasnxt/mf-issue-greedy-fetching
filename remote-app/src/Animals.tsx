const animals = ["horse", "sheep", "duck"];
const Animals = () => {
    return (
        <ul>
            {animals.map((animal) => {
                return <li key={animal}>{animal}</li>
            })}
        </ul>
    )
}

export default Animals;
