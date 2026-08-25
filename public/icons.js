export function roleSvg(kind){
  const icon = kind==='wallfacer'
    ? '<path d="M12 3 4.5 6v5.2c0 4.4 3.1 7.6 7.5 9.8 4.4-2.2 7.5-5.4 7.5-9.8V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>'
    : kind==='wallbreaker'
      ? '<path d="m5 4 14 8-14 8 3-8-3-8Z"/><path d="M10 12h8"/>'
      : kind==='police'
        ? '<path d="M12 2.8 15 5l3.7.2-.9 3.6 1.5 3.4-3.3 1.9-1.1 3.6-2.9-2.2-2.9 2.2L8 14.1l-3.3-1.9 1.5-3.4-.9-3.6L9 5l3-2.2Z"/><circle cx="12" cy="10.2" r="2.5"/><path d="M9.8 19.2h4.4M12 15.6v3.6"/>'
        : '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>';
  return `<svg class="role-svg" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}

export function wildRoleSvg(roleId){
  const icons={
    bounty:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    extremist:'<circle cx="4.5" cy="12" r="2.5"/><circle cx="19.5" cy="12" r="2.5"/><path d="M8 12h8M13 8.5l3.5 3.5-3.5 3.5"/>',
    conservationist:'<path d="M12 4v16M6 7h12M8 7 4.5 13h7L8 7ZM16 7l-3.5 6h7L16 7ZM8 20h8"/><path d="M4.5 13c.4 1.8 1.5 2.7 3.5 2.7s3.1-.9 3.5-2.7M12.5 13c.4 1.8 1.5 2.7 3.5 2.7s3.1-.9 3.5-2.7"/>',
    moderate:'<path d="M4 5h16v14H4z"/><path d="M8 16v-4M12 16V8M16 16v-6"/><circle cx="8" cy="10" r="1.5"/><circle cx="12" cy="6" r="1.5"/><circle cx="16" cy="8" r="1.5"/>',
    disruptor:'<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
    loner:'<circle cx="12" cy="12" r="2.5"/><path d="M12 3a9 9 0 0 1 7.8 4.5M21 12a9 9 0 0 1-4.5 7.8M12 21a9 9 0 0 1-7.8-4.5M3 12a9 9 0 0 1 4.5-7.8"/>'
  };
  const icon=icons[roleId]||'<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>';
  return `<svg class="role-svg wild-role-svg" data-wild-role-icon="${roleId||'wild'}" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}

export function eyeSvg(){
  return '<svg class="eye-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
}
