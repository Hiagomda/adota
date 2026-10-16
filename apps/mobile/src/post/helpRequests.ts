import type { Post } from '../types';

/**
 * A help request is open until its deadline, whatever step the animal is on: ração for a
 * shelter does not stop being needed because one dog was adopted.
 */
export function openHelpRequests(posts: Post[], now = Date.now()): Post[] {
  return posts.filter((post) => {
    if (!post.helpRequest) return false;
    const deadline = post.helpRequest.deadline ? Date.parse(post.helpRequest.deadline) : NaN;
    return Number.isNaN(deadline) || deadline >= now;
  });
}
