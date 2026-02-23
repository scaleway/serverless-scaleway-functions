FROM python:3-alpine

ARG VERSION=development

WORKDIR /usr/src/app

COPY requirements.txt .
RUN pip install -qr requirements.txt
COPY server.py .

ENV VERSION=${VERSION}

CMD ["python3", "./server.py"]
