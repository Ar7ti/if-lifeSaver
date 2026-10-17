export interface ExamplePrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  image: string;
}

export const EXAMPLES: ExamplePrompt[] = [
  { id: 'move', title: "I'm moving to a new city.", description: 'Budget, movers, furniture and a checklist in one place.', prompt: "I'm moving to Turku next month with a €2,000 budget. Help me organize everything and find the best options.", image: '/illustrations/moving-box.png' },
  { id: 'car', title: "I'm buying my first car.", description: 'Total cost of ownership, insurance and inspection steps.', prompt: "I'm buying my first used car in Helsinki with a budget of €8,000. Help me plan the purchase and running costs.", image: '/illustrations/first-car.png' },
  { id: 'furnish', title: "I'm furnishing my apartment.", description: 'Room-by-room shopping with new and second-hand options.', prompt: "I'm furnishing a one-bedroom apartment in Tampere with €1,500. I'm happy to buy second-hand.", image: '/illustrations/sofa.png' },
  { id: 'trip', title: "I'm planning an important trip.", description: 'Bookings, documents and a day-by-day plan.', prompt: "I'm planning a two-week trip to Japan in April with a €3,500 budget. Help me plan flights, stays and documents.", image: '/illustrations/travel-case.png' },
  { id: 'independent', title: "I'm starting an independent life.", description: 'First lease, contracts, essentials and a safety net.', prompt: "I'm moving out of my parents' home into my first apartment in Oulu with €2,500. Help me set everything up.", image: '/illustrations/first-home.png' },
];
