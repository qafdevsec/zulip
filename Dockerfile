FROM ubuntu:trusty-20190425

EXPOSE 9991

RUN apt-get update && apt-get install -y \
  python-pbs \
  wget

RUN useradd -d /home/zulip -m zulip && echo 'zulip ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

USER zulip

RUN ln -nsf /srv/zulip ~/zulip

WORKDIR /srv/zulip
