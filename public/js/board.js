// Board drag and drop (views/board.ejs) with SortableJS, which also works on touch screens.
// Every card's "Move to" menu does the same without dragging.

function setUpBoard() {
  document.querySelectorAll('[data-column]').forEach((list) =>
    Sortable.create(list, {
      group: 'board',
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150,
      delay: 150, // on touch screens a short press still scrolls the board
      delayOnTouchOnly: true,
      filter: 'details', // the menu button opens its menu instead of starting a drag
      preventOnFilter: false,
      ghostClass: 'opacity-40',
      // Saves the card's column and the new order of every card in it, top to bottom.
      onEnd: async ({ item, from, to, oldIndex, newIndex }) => {
        if (from === to && oldIndex === newIndex) return;
        const fields = new URLSearchParams({ status: to.dataset.column, returnTo: location.pathname + location.search });
        to.querySelectorAll('[data-task-id]').forEach((card) => fields.append('ids', card.dataset.taskId));
        try {
          await window.agendal.post(`/tasks/${item.dataset.taskId}/move`, fields);
        } catch {
          item.remove();
          from.insertBefore(item, from.children[oldIndex] ?? null);
          window.agendal.toast('The move couldn’t be confirmed. Reload to check the saved column before trying again.', { type: 'error' });
        }
      },
    })
  );
}

setUpBoard();
document.addEventListener('agendal:render', setUpBoard); // the board is swapped in fresh after every change
