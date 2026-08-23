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

export function eyeSvg(){
  return '<svg class="eye-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
}
