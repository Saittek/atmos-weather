/** Short actionable checklists by alert type (keyword match on event name) */
export function alertActionTips(event: string): string[] {
  const e = event.toLowerCase()

  if (e.includes('tornado')) {
    return [
      'Move to an interior room on the lowest floor — no windows',
      'Mobile homes and cars are not safe — get to a sturdy building',
      'Cover your head; stay put until the all-clear',
      'Keep shoes and a phone with you',
    ]
  }
  if (e.includes('severe thunderstorm') || e.includes('thunderstorm')) {
    return [
      'Stay indoors; avoid tall isolated trees and open fields',
      'Unplug sensitive electronics if lightning is close',
      'Postpone outdoor plans until the storm passes',
      'Watch for flooding in low spots if rain is heavy',
    ]
  }
  if (e.includes('flash flood') || e.includes('flood')) {
    return [
      'Turn around, don’t drown — never drive through flooded roads',
      'Move to higher ground if water is rising nearby',
      'Avoid walking in moving water',
      'Prepare to lose power; charge devices now',
    ]
  }
  if (e.includes('winter') || e.includes('blizzard') || e.includes('ice storm') || e.includes('snow')) {
    return [
      'Limit travel; if you must go, pack blankets and a full tank',
      'Watch for black ice on bridges and overpasses',
      'Check on neighbors who may need help',
      'Keep pipes from freezing; drip faucets if advised',
    ]
  }
  if (e.includes('heat') || e.includes('excessive heat')) {
    return [
      'Drink water often; avoid alcohol and heavy meals midday',
      'Stay in AC if possible; use cooling centers if needed',
      'Never leave kids or pets in cars',
      'Check on elderly neighbors and outdoor workers',
    ]
  }
  if (e.includes('wind') || e.includes('high wind')) {
    return [
      'Secure loose outdoor items and trash bins',
      'Avoid parking under large trees or weak limbs',
      'Expect power outages; charge devices',
      'Drive carefully — high-profile vehicles can tip',
    ]
  }
  if (e.includes('fire') || e.includes('red flag')) {
    return [
      'No open burning or fireworks',
      'Have a go-bag ready if you’re in a risk area',
      'Know multiple evacuation routes',
      'Follow local fire restrictions strictly',
    ]
  }
  if (e.includes('hurricane') || e.includes('tropical')) {
    return [
      'Review your evacuation zone and route now',
      'Stock water, food, meds, and batteries',
      'Charge devices; fill the car if leaving is possible',
      'Bring in outdoor furniture; secure loose items',
    ]
  }
  if (e.includes('fog')) {
    return [
      'Use low beams; never high beams in dense fog',
      'Slow down and increase following distance',
      'If you can’t see, pull off safely and wait',
    ]
  }
  if (e.includes('air quality') || e.includes('smoke')) {
    return [
      'Limit outdoor exercise',
      'Keep windows closed; use indoor filtration if you have it',
      'N95/KN95 helps with fine smoke particles',
    ]
  }

  return [
    'Monitor official updates from Environment Canada, NWS, or local emergency management',
    'Have a charged phone and a basic emergency kit',
    'Follow any evacuation or shelter instructions immediately',
  ]
}
