import { useState } from 'react';
import ChartsTab from "@/components/explorepage/charts/ChartsTab"
import ExploreTab from "@/components/explorepage/song/ExploreTab"
import ShowCalendar from "@/components/homepage/ShowCalendar"

// explore options are allowed
const allowedChoices = [
    {value: "song", text: "song", component: ExploreTab}, 
    {value: "chart", text: "chart", component: ChartsTab}
]

export default function Explore(){

    const [choice, setChoice] = useState(allowedChoices[0].value)

    // checks that the option selected is one that is allowed.
    const handleChoiceChange = (e) =>{
        const value = e.target.value;
        const option = allowedChoices.find(option => option.value === value);
        setChoice(option ? value : allowedChoices[0].value);    
    };

    // returns the component of the option choice that was selected
    const SelectedComponent = allowedChoices.find(option => option.value === choice)?.component;

    return (
        <div>
            <div className="flex flex-col items-center">
                <h1 className="mb-12 font-kallisto text-6xl font-normal text-white">
                    Explore and Find New Music
                </h1>
                <p className="text-base text-center text-gray-300 tracking-wide">
                    Choose your explore option
                </p>
                <label htmlFor="choiceSelect" className="text-white sr-only">Explore Options</label>
                <select
                    id="choiceSelect"
                    value={choice}
                    onChange={handleChoiceChange}
                    className="bg-black text-white border border-gray-600 rounded px-2 py-1"
                    aria-label="Select explore choice"
                >
                    {allowedChoices.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.text}
                        </option>
                    ))}
                </select>
            </div>

            {/* returns the component of the choice option that was selected */}
            {SelectedComponent && <SelectedComponent />}

            {/* Upcoming Shows — moved here from the homepage. The homepage
                "Shows we're stoked about" card links to this box (#upcoming-shows). */}
            <div className="mt-16 flex w-full justify-center overflow-x-auto px-4">
                <ShowCalendar />
            </div>
        </div>
    )
}