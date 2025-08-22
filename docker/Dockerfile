# Dockerfile

FROM valkey/valkey:latest

# Install Python and pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip netcat-openbsd &&\
    apt-get clean

RUN pip install --break-system-packages valkey

# Set the working directory to match the container config
WORKDIR /data

# Copy script and dependencies
COPY populate_data.py /usr/local/bin/populate_data.py
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

# Copy the ReJSON module into the image (adjust the source path as needed)
COPY rejson.so /valkey/modules/rejson.so

# Set the entrypoint and default command to load the module
ENTRYPOINT ["/usr/local/bin/start.sh"]

# Expose the default Redis/Valkey port
EXPOSE 6379