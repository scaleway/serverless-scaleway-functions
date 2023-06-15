FROM python:3-alpine
WORKDIR /usr/src/app

ENV PORT 8080
EXPOSE 8080

COPY requirements.txt .
RUN pip install -qr requirements.txt
COPY server.py .

CMD ["python3", "./server.py"]