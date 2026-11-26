import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  Group,
  Menu,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { FaGithub, FaRegMoon } from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';

import { loginUrl } from '@api/auth';
import { errorMessage } from '@api/client';
import { useSession } from '@global/session';

export function SignInButton({ size = 'xs' }: { size?: 'xs' | 'md' }) {
  return (
    <Button
      component="a"
      href={loginUrl()}
      size={size}
      variant={size === 'xs' ? 'default' : 'filled'}
      leftSection={<FaGithub />}
    >
      Sign in with GitHub
    </Button>
  );
}

/** Dark-mode toggle plus the signed-in user's avatar menu (or a sign-in button). */
export function UserMenu() {
  const { session, me, logout } = useSession();
  const colorScheme = useMantineColorScheme();

  let account = null;
  if (session.status === 'offline') {
    account = (
      <Tooltip label="The calendar server can't be reached right now.">
        <Badge variant="outline" color="gray">
          Offline
        </Badge>
      </Tooltip>
    );
  } else if (session.status === 'anonymous') {
    account = <SignInButton />;
  } else if (me) {
    account = (
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Avatar
            src={me.avatarUrl || null}
            size="sm"
            radius="xl"
            style={{ cursor: 'pointer' }}
          >
            {me.login.slice(0, 2).toUpperCase()}
          </Avatar>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>
            Signed in as <b>{me.login}</b>
          </Menu.Label>
          <Menu.Item
            leftSection={<FiLogOut />}
            onClick={() =>
              void logout().catch((error: unknown) =>
                notifications.show({
                  color: 'red',
                  message: errorMessage(error),
                })
              )
            }
          >
            Sign out
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    );
  }

  return (
    <Group gap="sm" wrap="nowrap">
      <ActionIcon
        variant="subtle"
        onClick={colorScheme.toggleColorScheme}
        aria-label="Toggle color scheme"
      >
        <FaRegMoon size="1.2em" />
      </ActionIcon>
      {account}
    </Group>
  );
}
