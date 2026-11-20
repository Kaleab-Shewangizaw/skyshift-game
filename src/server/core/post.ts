import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Skyshift: build today’s tower together, one shift each',
  });
};
