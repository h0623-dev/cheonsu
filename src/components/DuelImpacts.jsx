export default function DuelImpacts({ plan }) {
  return <div className="duel-impacts" aria-hidden="true">
    {plan.impacts.map((impact, index) => <div key={index} data-duel-impact={index}
      className={`duel-hit hit-${impact.material}`} style={{ '--hit-color': impact.color }}>
      <svg className="hit-core" viewBox="0 0 100 100" fill="none">
        <path d="M50 5L55 38L85 17L62 44L97 50L63 56L82 84L56 64L50 96L44 64L14 84L38 57L3 50L38 43L17 16L44 36Z" fill="currentColor" />
        <path d="M50 28L54 44L73 50L54 55L50 73L45 55L27 50L45 45Z" fill="#ffffef"/>
      </svg>
      <i className="hit-pressure" />
      {Array.from({ length: impact.count }, (_, particle) => <i key={particle} className="hit-particle" data-particle={particle} />)}
      {plan.contacts.length > 1 && <span className="hit-chain">{index + 1}연타</span>}
    </div>)}
    {plan.footfalls.map((at, index) => <div key={index} className="duel-footfall" data-footfall={index} data-at={at}><i/><i/><i/></div>)}
  </div>;
}
